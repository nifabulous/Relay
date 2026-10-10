import { ROLE_LABEL, STATUS_LABEL, type RouteStop, type RouteStopStatus } from "./routeStops";
import "./LinesRoute.css";

export interface LinesRouteProps {
  stops: RouteStop[];
  /** 0 to 1. Omitted means the whole route is drawn. */
  progress?: number;
  summary: string;
  paused?: boolean;
  onTogglePause?: () => void;
  ariaLabel: string;
}

const VIEW_WIDTH = 1080;
const VIEW_HEIGHT = 240;
const PATH_Y = 120;

function stopX(index: number, count: number): number {
  if (count <= 1) return VIEW_WIDTH / 2;
  return 100 + (index * (VIEW_WIDTH - 200)) / (count - 1);
}

function StatusIcon({ status }: { status: RouteStopStatus }) {
  return (
    <svg
      className="lines-route__icon"
      viewBox="0 0 16 16"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {status === "passed" && <path d="M3 8.5 6.5 12 13 4.5" />}
      {status === "needs_attention" && <path d="M8 3v6M8 12.5v.01" />}
      {status === "failed" && <path d="M4 4l8 8M12 4l-8 8" />}
      {status === "unavailable" && (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M5.5 8h5" />
        </>
      )}
      {status === "not_checked" && <circle cx="8" cy="8" r="6" />}
    </svg>
  );
}

export function LinesRoute({ stops, progress, summary, paused = false, onTogglePause, ariaLabel }: LinesRouteProps) {
  const count = stops.length;
  const drawn = progress === undefined ? 1 : Math.min(1, Math.max(0, progress));
  const pathD = stops.map((_, index) => `${index === 0 ? "M" : "L"} ${stopX(index, count)} ${PATH_Y}`).join(" ");

  return (
    <figure className="lines-route" aria-label={ariaLabel}>
      <svg
        className="lines-route__svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="lines-route__track" d={pathD} />
        <path
          className="lines-route__drawn"
          d={pathD}
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={1 - drawn}
        />
        {stops.map((stop, index) => (
          <rect
            key={`${stop.role}-${index}`}
            className={`lines-route__node lines-route__node--${stop.status}`}
            x={stopX(index, count) - 7}
            y={PATH_Y - 7}
            width={14}
            height={14}
          />
        ))}
      </svg>

      <ol className="lines-route__steps" aria-label={ariaLabel} role="list">
        {stops.map((stop, index) => (
          <li key={`${stop.role}-${index}`} className={`lines-route__step lines-route__step--${stop.status}`}>
            <span className="lines-route__role">
              [ {String(index + 1).padStart(2, "0")} ] {ROLE_LABEL[stop.role]}
            </span>
            <b className="lines-route__name">{stop.name}</b>
            {stop.detail && <span className="lines-route__detail">{stop.detail}</span>}
            <span className="lines-route__status">
              <StatusIcon status={stop.status} />
              {STATUS_LABEL[stop.status]}
            </span>
          </li>
        ))}
      </ol>

      <figcaption className="sr">{summary}</figcaption>

      {onTogglePause && (
        <button type="button" className="lines-route__pause" aria-pressed={paused} onClick={onTogglePause}>
          {paused ? "Play route" : "Pause route"}
        </button>
      )}
    </figure>
  );
}
