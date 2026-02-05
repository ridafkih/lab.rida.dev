#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/imgutils.h>
#include <libswscale/swscale.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

typedef struct {
    const uint8_t *buf;
    size_t size;
    size_t pos;
} MemoryBuffer;

static int read_packet(void *opaque, uint8_t *buf, int buf_size) {
    MemoryBuffer *mb = (MemoryBuffer *)opaque;
    size_t remaining = mb->size - mb->pos;
    if (remaining == 0) return AVERROR_EOF;
    size_t to_read = buf_size < remaining ? buf_size : remaining;
    memcpy(buf, mb->buf + mb->pos, to_read);
    mb->pos += to_read;
    return (int)to_read;
}

static int64_t seek_packet(void *opaque, int64_t offset, int whence) {
    MemoryBuffer *mb = (MemoryBuffer *)opaque;
    int64_t new_pos;

    switch (whence) {
        case SEEK_SET:
            new_pos = offset;
            break;
        case SEEK_CUR:
            new_pos = (int64_t)mb->pos + offset;
            break;
        case SEEK_END:
            new_pos = (int64_t)mb->size + offset;
            break;
        case AVSEEK_SIZE:
            return (int64_t)mb->size;
        default:
            return AVERROR(EINVAL);
    }

    // Validate bounds (handle negative positions)
    if (new_pos < 0) new_pos = 0;
    if (new_pos > (int64_t)mb->size) new_pos = (int64_t)mb->size;

    mb->pos = (size_t)new_pos;
    return (int64_t)mb->pos;
}

int resize_image(
    void *input_buf, size_t input_len,
    int max_dimension,
    void **output_buf, size_t *output_len,
    int *out_width, int *out_height
) {
    AVFormatContext *fmt_ctx = NULL;
    AVCodecContext *dec_ctx = NULL;
    AVCodecContext *enc_ctx = NULL;
    AVIOContext *input_io = NULL;
    struct SwsContext *sws_ctx = NULL;
    AVFrame *frame = NULL, *scaled_frame = NULL;
    AVPacket *pkt = NULL;
    MemoryBuffer *mb = NULL;
    uint8_t *io_buffer = NULL;
    int ret = 0;
    int stream_idx = -1;

    *output_buf = NULL;
    *output_len = 0;

    mb = (MemoryBuffer *)malloc(sizeof(MemoryBuffer));
    if (!mb) return AVERROR(ENOMEM);
    mb->buf = (const uint8_t *)input_buf;
    mb->size = input_len;
    mb->pos = 0;

    io_buffer = (uint8_t *)av_malloc(32768);
    if (!io_buffer) { ret = AVERROR(ENOMEM); goto cleanup; }

    input_io = avio_alloc_context(io_buffer, 32768, 0, mb, read_packet, NULL, seek_packet);
    if (!input_io) { ret = AVERROR(ENOMEM); goto cleanup; }
    io_buffer = NULL; // avio context owns it now

    fmt_ctx = avformat_alloc_context();
    if (!fmt_ctx) { ret = AVERROR(ENOMEM); goto cleanup; }
    fmt_ctx->pb = input_io;

    if ((ret = avformat_open_input(&fmt_ctx, NULL, NULL, NULL)) < 0) goto cleanup;
    if ((ret = avformat_find_stream_info(fmt_ctx, NULL)) < 0) goto cleanup;

    for (unsigned int i = 0; i < fmt_ctx->nb_streams; i++) {
        if (fmt_ctx->streams[i]->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
            stream_idx = i;
            break;
        }
    }
    if (stream_idx < 0) { ret = AVERROR_STREAM_NOT_FOUND; goto cleanup; }

    const AVCodec *decoder = avcodec_find_decoder(fmt_ctx->streams[stream_idx]->codecpar->codec_id);
    if (!decoder) { ret = AVERROR_DECODER_NOT_FOUND; goto cleanup; }

    dec_ctx = avcodec_alloc_context3(decoder);
    if (!dec_ctx) { ret = AVERROR(ENOMEM); goto cleanup; }
    if ((ret = avcodec_parameters_to_context(dec_ctx, fmt_ctx->streams[stream_idx]->codecpar)) < 0) goto cleanup;
    if ((ret = avcodec_open2(dec_ctx, decoder, NULL)) < 0) goto cleanup;

    frame = av_frame_alloc();
    pkt = av_packet_alloc();
    if (!frame || !pkt) { ret = AVERROR(ENOMEM); goto cleanup; }

    int got_frame = 0;
    while (av_read_frame(fmt_ctx, pkt) >= 0) {
        if (pkt->stream_index == stream_idx) {
            if ((ret = avcodec_send_packet(dec_ctx, pkt)) < 0) {
                av_packet_unref(pkt);
                goto cleanup;
            }
            if (avcodec_receive_frame(dec_ctx, frame) == 0) {
                got_frame = 1;
                av_packet_unref(pkt);
                break;
            }
        }
        av_packet_unref(pkt);
    }
    if (!got_frame) { ret = AVERROR_INVALIDDATA; goto cleanup; }

    int src_w = frame->width, src_h = frame->height;
    int dst_w = src_w, dst_h = src_h;

    if (src_w > max_dimension || src_h > max_dimension) {
        float scale = (float)max_dimension / (src_w > src_h ? src_w : src_h);
        dst_w = (int)(src_w * scale);
        dst_h = (int)(src_h * scale);
        if (dst_w < 1) dst_w = 1;
        if (dst_h < 1) dst_h = 1;
    }

    *out_width = dst_w;
    *out_height = dst_h;

    if (dst_w == src_w && dst_h == src_h) {
        *output_buf = malloc(input_len);
        if (!*output_buf) { ret = AVERROR(ENOMEM); goto cleanup; }
        memcpy(*output_buf, input_buf, input_len);
        *output_len = input_len;
        ret = 0;
        goto cleanup;
    }

    // Find PNG encoder and determine supported pixel format
    const AVCodec *encoder = avcodec_find_encoder(AV_CODEC_ID_PNG);
    if (!encoder) { ret = AVERROR_ENCODER_NOT_FOUND; goto cleanup; }

    // Pick a pixel format the encoder supports (prefer RGBA for transparency, then RGB24)
    enum AVPixelFormat target_fmt = AV_PIX_FMT_RGBA;
    if (encoder->pix_fmts) {
        int found_rgba = 0, found_rgb24 = 0;
        for (int i = 0; encoder->pix_fmts[i] != AV_PIX_FMT_NONE; i++) {
            if (encoder->pix_fmts[i] == AV_PIX_FMT_RGBA) found_rgba = 1;
            if (encoder->pix_fmts[i] == AV_PIX_FMT_RGB24) found_rgb24 = 1;
        }
        if (found_rgba) target_fmt = AV_PIX_FMT_RGBA;
        else if (found_rgb24) target_fmt = AV_PIX_FMT_RGB24;
        else target_fmt = encoder->pix_fmts[0]; // fallback to first supported
    }

    sws_ctx = sws_getContext(
        src_w, src_h, frame->format,
        dst_w, dst_h, target_fmt,
        SWS_LANCZOS, NULL, NULL, NULL
    );
    if (!sws_ctx) { ret = AVERROR(EINVAL); goto cleanup; }

    scaled_frame = av_frame_alloc();
    if (!scaled_frame) { ret = AVERROR(ENOMEM); goto cleanup; }
    scaled_frame->format = target_fmt;
    scaled_frame->width = dst_w;
    scaled_frame->height = dst_h;
    if ((ret = av_frame_get_buffer(scaled_frame, 0)) < 0) goto cleanup;

    sws_scale(sws_ctx, (const uint8_t * const *)frame->data, frame->linesize,
              0, src_h, scaled_frame->data, scaled_frame->linesize);

    enc_ctx = avcodec_alloc_context3(encoder);
    if (!enc_ctx) { ret = AVERROR(ENOMEM); goto cleanup; }
    enc_ctx->width = dst_w;
    enc_ctx->height = dst_h;
    enc_ctx->pix_fmt = target_fmt;
    enc_ctx->time_base = (AVRational){1, 1};

    if ((ret = avcodec_open2(enc_ctx, encoder, NULL)) < 0) goto cleanup;

    av_packet_unref(pkt);
    if ((ret = avcodec_send_frame(enc_ctx, scaled_frame)) < 0) goto cleanup;
    if ((ret = avcodec_receive_packet(enc_ctx, pkt)) < 0) goto cleanup;

    // DEBUG: Print first 16 bytes from FFmpeg
    fprintf(stderr, "DEBUG pkt->size=%d, first 16 bytes: ", pkt->size);
    for (int i = 0; i < 16 && i < pkt->size; i++) {
        fprintf(stderr, "%02x ", pkt->data[i]);
    }
    fprintf(stderr, "\n");

    // PNG signature (8 bytes)
    static const uint8_t png_signature[8] = {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};

    // Check if the packet already has the PNG signature
    int has_signature = (pkt->size >= 8 && memcmp(pkt->data, png_signature, 8) == 0);
    fprintf(stderr, "DEBUG has_signature=%d\n", has_signature);

    if (has_signature) {
        // FFmpeg included the signature - just copy as-is
        *output_buf = malloc(pkt->size);
        if (!*output_buf) { ret = AVERROR(ENOMEM); goto cleanup; }
        memcpy(*output_buf, pkt->data, pkt->size);
        *output_len = pkt->size;
    } else {
        // FFmpeg omitted the signature - prepend it manually
        *output_buf = malloc(8 + pkt->size);
        if (!*output_buf) { ret = AVERROR(ENOMEM); goto cleanup; }
        memcpy(*output_buf, png_signature, 8);
        memcpy((uint8_t *)*output_buf + 8, pkt->data, pkt->size);
        *output_len = 8 + pkt->size;
    }

    // DEBUG: Print first 16 bytes of output buffer
    fprintf(stderr, "DEBUG output_len=%zu, output first 16 bytes: ", *output_len);
    for (int i = 0; i < 16 && i < (int)*output_len; i++) {
        fprintf(stderr, "%02x ", ((uint8_t *)*output_buf)[i]);
    }
    fprintf(stderr, "\n");

    ret = 0;

cleanup:
    if (frame) av_frame_free(&frame);
    if (scaled_frame) av_frame_free(&scaled_frame);
    if (pkt) av_packet_free(&pkt);
    if (sws_ctx) sws_freeContext(sws_ctx);
    if (dec_ctx) avcodec_free_context(&dec_ctx);
    if (enc_ctx) avcodec_free_context(&enc_ctx);

    // Fix: Properly handle AVIOContext cleanup to avoid double-free
    // avformat_close_input does NOT free a custom pb, so we must do it ourselves
    if (fmt_ctx) {
        AVIOContext *pb = fmt_ctx->pb;
        fmt_ctx->pb = NULL;  // Detach before closing to be safe
        avformat_close_input(&fmt_ctx);
        if (pb) {
            av_freep(&pb->buffer);
            avio_context_free(&pb);
        }
        input_io = NULL;  // Already freed above
    } else if (input_io) {
        // fmt_ctx was never created or open_input failed before taking ownership
        av_freep(&input_io->buffer);
        avio_context_free(&input_io);
    }

    if (io_buffer) av_free(io_buffer);
    if (mb) free(mb);
    return ret;
}

void free_buffer(void *buf) {
    free(buf);
}
