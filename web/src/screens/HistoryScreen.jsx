// The History tab. Workouts, weights over time and injuries come with the next
// step (a /api/history route over Supabase); until then the tab says so.
import { Badge, EmptyState } from "../ui/index.js";

export function HistoryScreen() {
  return (
    <div className="gc-historypage">
      <header className="gc-page-head">
        <h1 className="title-l">Historia i postępy</h1>
        <Badge tone="neutral" icon="history">Wkrótce</Badge>
      </header>
      <EmptyState icon="history" title="Historia pojawi się wkrótce">
        Treningi, ciężary i kontuzje już zapisują się w dzienniku. Tutaj zobaczysz ostatnie treningi,
        zmiany ciężaru w ćwiczeniach i aktywne kontuzje z przyciskiem „Wyleczone”.
      </EmptyState>
    </div>
  );
}
