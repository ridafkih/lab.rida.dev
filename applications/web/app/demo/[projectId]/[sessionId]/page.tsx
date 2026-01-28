import { Copy } from "@lab/ui/components/copy";

type Props = {
  params: Promise<{ projectId: string; sessionId: string }>;
};

export default async function SessionPage({ params }: Props) {
  const { sessionId } = await params;

  return (
    <div className="flex-1 p-4">
      <Copy size="sm" muted>
        Viewing session: {sessionId}
      </Copy>
    </div>
  );
}
