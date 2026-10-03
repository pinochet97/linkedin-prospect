import { OctagonX, Play } from 'lucide-react';
import { resumeAutomations, stopAllAutomations } from '@/app/actions/automation';
import { SubmitButton } from '@/components/shell/submit-button';

export function KillSwitch({ paused }: { paused: boolean }) {
  if (paused) {
    return (
      <form action={resumeAutomations}>
        <SubmitButton variant="outline" size="sm" className="w-full">
          <Play className="h-3.5 w-3.5" />
          Retomar automações
        </SubmitButton>
      </form>
    );
  }

  return (
    <form action={stopAllAutomations}>
      <SubmitButton variant="danger" size="sm" className="w-full">
        <OctagonX className="h-3.5 w-3.5" />
        Parar tudo
      </SubmitButton>
    </form>
  );
}
