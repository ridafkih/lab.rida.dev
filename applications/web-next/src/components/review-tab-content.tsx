"use client";

import { Review } from "@/components/review";
import { TextAreaGroup } from "@/components/textarea-group";
import { useFileBrowser } from "@/lib/use-file-browser";
import type { ReactNode } from "react";

type FileBrowserProviderProps = {
  sessionId: string;
  children: ReactNode;
};

function FileBrowserProvider({ sessionId, children }: FileBrowserProviderProps) {
  const browser = useFileBrowser(sessionId);

  return (
    <Review.Provider files={[]} onDismiss={() => {}} browser={browser}>
      {children}
    </Review.Provider>
  );
}

function FeedbackForm() {
  return (
    <Review.Feedback>
      <Review.FeedbackHeader>
        <Review.FeedbackLocation />
      </Review.FeedbackHeader>
      <TextAreaGroup.Input placeholder="Your feedback will be submitted to the agent..." rows={2} />
      <TextAreaGroup.Toolbar>
        <TextAreaGroup.Submit />
      </TextAreaGroup.Toolbar>
    </Review.Feedback>
  );
}

function FileBrowserView() {
  return (
    <Review.Frame>
      <Review.MainPanel>
        <Review.Empty />
        <Review.PreviewHeader />
        <Review.PreviewView>
          <Review.PreviewContent />
          <FeedbackForm />
        </Review.PreviewView>
      </Review.MainPanel>
      <Review.SidePanel>
        <Review.Browser>
          <Review.BrowserHeader />
          <Review.BrowserTree />
        </Review.Browser>
      </Review.SidePanel>
    </Review.Frame>
  );
}

type ReviewTabContentProps = {
  sessionId: string;
};

export function ReviewTabContent({ sessionId }: ReviewTabContentProps) {
  return (
    <FileBrowserProvider sessionId={sessionId}>
      <FileBrowserView />
    </FileBrowserProvider>
  );
}
