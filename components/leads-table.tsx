import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState, Table, Td, Th } from '@/components/ui/table';
import type { EnrollmentWithLead } from '@/lib/db/types';
import { formatDateTime, formatRelative } from '@/lib/utils';
import type { NextAction } from '@/lib/engine/types';

const NEXT_ACTION_LABELS: Record<NextAction, string> = {
  qualify: 'Qualificar',
  send_connection_request: 'Enviar convite',
  check_connection: 'Verificar aceite',
  send_first_message: 'Enviar 1ª mensagem',
  send_followup_1: 'Enviar follow-up 1',
  send_followup_2: 'Enviar follow-up 2',
  none: '—',
};

export function LeadsTable({ enrollments }: { enrollments: EnrollmentWithLead[] }) {
  if (enrollments.length === 0) {
    return <EmptyState>Nenhum lead aqui ainda.</EmptyState>;
  }

  return (
    <Table>
      <thead>
        <tr>
          <Th>Lead</Th>
          <Th>Cargo / empresa</Th>
          <Th>Status</Th>
          <Th>Score</Th>
          <Th>Próxima ação</Th>
          <Th>Atualizado</Th>
        </tr>
      </thead>
      <tbody>
        {enrollments.map((enrollment) => (
          <tr key={enrollment.id}>
            <Td>
              <div className="flex items-center gap-1.5">
                <Link href={`/leads/${enrollment.id}`} className="font-medium hover:underline">
                  {enrollment.lead.full_name}
                </Link>
                <a
                  href={enrollment.lead.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Abrir perfil no LinkedIn"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              {enrollment.campaign_count > 1 ? (
                <Badge tone="warning" className="mt-1">
                  em {enrollment.campaign_count} campanhas
                </Badge>
              ) : null}
            </Td>
            <Td className="max-w-72">
              <p className="truncate text-sm">{enrollment.lead.job_title ?? enrollment.lead.headline ?? '—'}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[enrollment.lead.company, enrollment.lead.location].filter(Boolean).join(' · ') || '—'}
              </p>
            </Td>
            <Td>
              <StatusBadge status={enrollment.status} />
            </Td>
            <Td className="tabular-nums">{enrollment.qualification_score ?? '—'}</Td>
            <Td className="text-xs">
              {enrollment.next_action && enrollment.next_action !== 'none' ? (
                <>
                  <p>{NEXT_ACTION_LABELS[enrollment.next_action]}</p>
                  <p className="text-muted-foreground">{formatRelative(enrollment.next_action_at)}</p>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Td>
            <Td className="text-xs text-muted-foreground">{formatDateTime(enrollment.updated_at)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
