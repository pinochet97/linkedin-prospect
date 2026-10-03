import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('border-b px-4 py-2.5 text-left text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b px-4 py-3 align-middle', className)} {...props} />;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
