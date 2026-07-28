export default function Loading() {
  return (
    <main className="app-shell loading-shell" aria-busy="true">
      <div className="loading-nav shimmer" />
      <div className="loading-title shimmer" />
      <div className="loading-grid">
        <div className="loading-card shimmer" />
        <div className="loading-card shimmer" />
        <div className="loading-card shimmer" />
      </div>
      <div className="loading-chart shimmer" />
    </main>
  );
}
