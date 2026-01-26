type Props = {
  symbols: string[]
  symbol: string
  setSymbol: (v: string) => void

  start: string
  setStart: (v: string) => void

  end: string
  setEnd: (v: string) => void

  timeScale: number
  setTimeScale: (v: number) => void

  gapScale: number
  setGapScale: (n: number) => void

  playing: boolean
  onPlay: () => void
  onPause?: () => void
}

export function TopBar({
  symbols,
  symbol,
  setSymbol,
  start,
  setStart,
  end,
  setEnd,
  timeScale,
  setTimeScale,
  gapScale,
  setGapScale,
  playing,
  onPlay,
  onPause,
}: Props) {
  return (
    <div style={{ display: "flex", gap: 12, padding: 12 }}>
      <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
        {symbols.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
      <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />

      <input
        type="number"
        value={timeScale}
        onChange={(e) => setTimeScale(Number(e.target.value))}
      />

      <div className="flex flex-col text-xs text-gray-300">
  <label>Gap Speed</label>
  <select
    value={gapScale}
    onChange={(e) => setGapScale(Number(e.target.value))}
    className="bg-slate-800 text-white px-2 py-1 rounded"
  >
    <option value={1000}>Slow</option>
    <option value={10000}>Medium</option>
    <option value={100000}>Fast</option>
    <option value={1000000}>Instant</option>
  </select>
</div>


      {!playing ? (
        <button onClick={onPlay}>▶ Play</button>
      ) : (
        <button onClick={onPause}>⏸ Pause</button>
      )}
    </div>
  )
}