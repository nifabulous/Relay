import "./PageLoader.css";

export function PageLoader({ destination }: { destination: string }) {
  return (
    <div className="page-loader surface-landing" role="status" aria-label={`Loading ${destination}`}>
      <span className="page-loader__bar" aria-hidden="true" />
      <span>Loading {destination}…</span>
    </div>
  );
}
