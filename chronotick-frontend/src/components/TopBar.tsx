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
  onReplay?: () => void
  isConnected: boolean
}

const inputStyle = {
  background: "#1e2235",
  color: "white",
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #2a2e45",
  fontSize: "14px",
  outline: "none"
}

const labelStyle = {
  fontSize: "10px",
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: "4px"
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
  onReplay,
  isConnected,
}: Props) {
  return (
    <div style={{
      background: "#0f1320",
      borderTop: "1px solid #2a2e45",
      padding: "12px 24px"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {/* Symbol Selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={labelStyle}>Symbol</label>
          <select 
            value={symbol} 
            onChange={(e) => setSymbol(e.target.value)}
            style={{ ...inputStyle, minWidth: "120px", fontWeight: 500 }}
          >
            {symbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div style={{ width: "1px", height: "40px", background: "#2a2e45" }} />

        {/* Date Range */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={labelStyle}>Start Date</label>
          <input 
            type="datetime-local" 
            value={start} 
            onChange={(e) => setStart(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={labelStyle}>End Date</label>
          <input 
            type="datetime-local" 
            value={end} 
            onChange={(e) => setEnd(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ width: "1px", height: "40px", background: "#2a2e45" }} />

        {/* Time Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={labelStyle}>Speed (ms)</label>
          <input
            type="number"
            value={timeScale}
            onChange={(e) => setTimeScale(Number(e.target.value))}
            style={{ ...inputStyle, width: "96px" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={labelStyle}>Gap Speed</label>
          <select
            value={gapScale}
            onChange={(e) => setGapScale(Number(e.target.value))}
            style={{ ...inputStyle, fontWeight: 500 }}
          >
            <option value={1000}>Slow</option>
            <option value={10000}>Medium</option>
            <option value={100000}>Fast</option>
            <option value={1000000}>Instant</option>
          </select>
        </div>

        <div style={{ flex: 1 }} />

        {/* Playback Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Replay Button - Only show when disconnected (replay finished) */}
          {!isConnected && onReplay && (
            <button 
              onClick={onReplay}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "8px",
                fontWeight: 500,
                fontSize: "14px",
                border: "none",
                cursor: "pointer",
                background: "#6366f1",
                color: "white",
                boxShadow: "0 4px 6px -1px rgba(99, 102, 241, 0.3)",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#4f46e5"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#6366f1"
              }}
            >
              ↻ Replay
            </button>
          )}

          {/* Play/Pause Button - Only show when connected */}
          {isConnected && (
            !playing ? (
              <button 
                onClick={onPlay}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 20px",
                  borderRadius: "8px",
                  fontWeight: 500,
                  fontSize: "14px",
                  border: "none",
                  cursor: "pointer",
                  background: "#16a34a",
                  color: "white",
                  boxShadow: "0 4px 6px -1px rgba(22, 163, 74, 0.3)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#15803d"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#16a34a"
                }}
              >
                ▶ Play
              </button>
            ) : (
              <button 
                onClick={onPause}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 20px",
                  borderRadius: "8px",
                  fontWeight: 500,
                  fontSize: "14px",
                  border: "none",
                  cursor: "pointer",
                  background: "#ca8a04",
                  color: "white",
                  boxShadow: "0 4px 6px -1px rgba(202, 138, 4, 0.3)",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#a16207"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#ca8a04"
                }}
              >
                ⏸ Pause
              </button>
            )
          )}

          {/* Initial Play Button - Show when not connected and no replay */}
          {!isConnected && !onReplay && (
            <button 
              onClick={onPlay}
              disabled={true}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 20px",
                borderRadius: "8px",
                fontWeight: 500,
                fontSize: "14px",
                border: "none",
                cursor: "not-allowed",
                background: "#2a2e45",
                color: "#6b7280",
                transition: "all 0.2s"
              }}
            >
              ▶ Play
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
