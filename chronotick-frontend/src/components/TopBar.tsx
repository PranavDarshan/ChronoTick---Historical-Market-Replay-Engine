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
  onStop: () => void
  onConnect: () => void
  isConnected: boolean
  isStopped: boolean
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
  onStop,
  onConnect,
  isConnected,
  isStopped,
}: Props) {
  return (
    <div style={{ display: "flex", gap: 12, padding: 12, alignItems: "flex-end" }}>
      <div className="flex flex-col text-xs text-gray-300">
        <label>Symbol</label>
        <select 
          value={symbol} 
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-slate-800 text-white px-2 py-1 rounded"
        >
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col text-xs text-gray-300">
        <label>Start</label>
        <input 
          type="datetime-local" 
          value={start} 
          onChange={(e) => setStart(e.target.value)}
          className="bg-slate-800 text-white px-2 py-1 rounded"
        />
      </div>

      <div className="flex flex-col text-xs text-gray-300">
        <label>End</label>
        <input 
          type="datetime-local" 
          value={end} 
          onChange={(e) => setEnd(e.target.value)}
          className="bg-slate-800 text-white px-2 py-1 rounded"
        />
      </div>

      <div className="flex flex-col text-xs text-gray-300">
        <label>Time Scale</label>
        <input
          type="number"
          value={timeScale}
          onChange={(e) => setTimeScale(Number(e.target.value))}
          className="bg-slate-800 text-white px-2 py-1 rounded w-24"
        />
      </div>

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

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {!playing ? (
          <button 
            onClick={onPlay}
            disabled={!isConnected}
            className={`px-4 py-1 rounded ${
              isConnected 
                ? "bg-green-600 hover:bg-green-700 text-white" 
                : "bg-gray-600 text-gray-400 cursor-not-allowed"
            }`}
          >
            ▶ Play
          </button>
        ) : (
          <button 
            onClick={onPause}
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-1 rounded"
          >
            ⏸ Pause
          </button>
        )}
        
        {isConnected ? (
          <button 
            onClick={onStop}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-1 rounded flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            ⏹ Stop
          </button>
        ) : (
          <button 
            onClick={onConnect}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            🔌 Connect
          </button>
        )}
      </div>
    </div>
  )
}