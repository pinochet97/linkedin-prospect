import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return DATE_TIME.format(new Date(value));
}

export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return TIME.format(new Date(value));
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const minutes = Math.round(diffMs / 60000);
  const abs = Math.abs(minutes);
  if (abs < 1) return 'agora';
  if (abs < 60) return minutes < 0 ? `há ${abs} min` : `em ${abs} min`;
  const hours = Math.round(abs / 60);
  if (hours < 24) return minutes < 0 ? `há ${hours}h` : `em ${hours}h`;
  const days = Math.round(hours / 24);
  return minutes < 0 ? `há ${days}d` : `em ${days}d`;
}
