'use client';

import { KanbanBoard } from '@/components/kanban/KanbanBoard';

export default function KanbanPage() {
  return (
    <div className="max-w-[1600px] mx-auto h-full flex flex-col">
      <main className="flex-1">
        <KanbanBoard />
      </main>
    </div>
  );
}
