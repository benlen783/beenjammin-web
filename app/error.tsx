"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="centered-state">
      <div className="state-mark">!</div>
      <p className="eyebrow">Dashboard unavailable</p>
      <h1>The listening history could not be loaded.</h1>
      <p className="muted-copy">Refresh the page or try again in a moment.</p>
      <button className="primary-button" type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
