// TodoList — renders the ordered list of todos, with an empty-state prompt.

import TodoItem from './TodoItem';
import { ClipboardList } from 'lucide-react';

/**
 * Props:
 *   todos    — array of todo objects
 *   onToggle — (id) => void
 *   onDelete — (id) => void
 */
export default function TodoList({ todos, onToggle, onDelete }) {
  if (todos.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 gap-3"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <ClipboardList size={40} strokeWidth={1.2} aria-hidden="true" />
        <p className="text-sm">No tasks yet — add one above!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
