interface MaturityItem {
  id: string;
  label: string;
  score: number;
  target?: number;
  annotation?: string;
}

interface ObservabilityMaturityChartProps {
  items: MaturityItem[];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function ObservabilityMaturityChart({
  items,
}: ObservabilityMaturityChartProps) {
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const score = clampScore(item.score);
        const target = item.target ? clampScore(item.target) : null;

        return (
          <div key={item.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>{item.label}</span>
              <span className="text-muted-foreground">
                {score}%{target !== null ? ` / ${target}%` : ''}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${score}%` }}
              />
              {target !== null ? (
                <div
                  className="relative -mt-2 h-2"
                  aria-hidden="true"
                >
                  <span
                    className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded-full bg-primary/60"
                    style={{ left: `${target}%` }}
                  />
                </div>
              ) : null}
            </div>
            {item.annotation ? (
              <p className="text-sm text-muted-foreground">
                {item.annotation}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

