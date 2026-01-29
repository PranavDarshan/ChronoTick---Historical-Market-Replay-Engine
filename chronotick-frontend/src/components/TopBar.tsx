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
  background: "#000000",
  color: "#E5E7EB",
  padding: "6px 10px",
  borderRadius: "3px",
  border: "1px solid #1A1A1A",
  fontSize: "11px",
  outline: "none",
  fontWeight: 500 as const,
  fontFamily: "'Inter', sans-serif"
}

const labelStyle = {
  fontSize: "9px",
  fontWeight: 600 as const,
  color: "#6B7280",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
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
      background: "#0A0A0A",
      padding: "10px 24px",
      display: "flex",
      alignItems: "center",
      gap: "16px"
    }}>
      {/* Symbol Selector */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={labelStyle}>Symbol</label>
        <select 
          value={symbol} 
          onChange={(e) => setSymbol(e.target.value)}
          style={{ 
            ...inputStyle, 
            minWidth: "110px",
            cursor: "pointer"
          }}
        >
          {symbols.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div style={{ width: "1px", height: "36px", background: "#1A1A1A" }} />

      {/* Date Range */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={labelStyle}>Start</label>
        <input 
          type="datetime-local" 
          value={start} 
          onChange={(e) => setStart(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={labelStyle}>End</label>
        <input 
          type="datetime-local" 
          value={end} 
          onChange={(e) => setEnd(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ width: "1px", height: "36px", background: "#1A1A1A" }} />

      {/* Time Controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={labelStyle}>Speed (ms)</label>
        <input
          type="number"
          value={timeScale}
          onChange={(e) => setTimeScale(Number(e.target.value))}
          style={{ ...inputStyle, width: "90px" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label style={labelStyle}>Gap</label>
        <select
          value={gapScale}
          onChange={(e) => setGapScale(Number(e.target.value))}
          style={{ ...inputStyle, cursor: "pointer", width: "90px" }}
        >
          <option value={1000}>Slow</option>
          <option value={10000}>Med</option>
          <option value={100000}>Fast</option>
          <option value={1000000}>Instant</option>
        </select>
      </div>

      <div style={{ flex: 1 }} />

      {/* Playback Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* Replay Button */}
        {!isConnected && onReplay && (
          <button 
            onClick={onReplay}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              borderRadius: "4px",
              fontWeight: 700,
              fontSize: "11px",
              border: "none",
              cursor: "pointer",
              background: "#2196F3",
              color: "#FFFFFF",
              transition: "all 0.15s",
              letterSpacing: "0.5px"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#42A5F5"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#2196F3"
            }}
          >
            <svg 
              style={{ width: "12px", height: "12px" }}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
            REPLAY
          </button>
        )}

        {/* Play/Pause Button */}
        {isConnected && (
          !playing ? (
            <button 
              onClick={onPlay}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "4px",
                fontWeight: 700,
                fontSize: "11px",
                border: "none",
                cursor: "pointer",
                background: "#00C853",
                color: "#000000",
                transition: "all 0.15s",
                letterSpacing: "0.5px"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#00E676"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#00C853"
              }}
            >
              <svg 
                style={{ width: "10px", height: "10px" }}
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z"/>
              </svg>
              PLAY
            </button>
          ) : (
            <button 
              onClick={onPause}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "4px",
                fontWeight: 700,
                fontSize: "11px",
                border: "none",
                cursor: "pointer",
                background: "#FF9800",
                color: "#000000",
                transition: "all 0.15s",
                letterSpacing: "0.5px"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#FFB74D"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#FF9800"
              }}
            >
              <svg 
                style={{ width: "10px", height: "10px" }}
                fill="currentColor" 
                viewBox="0 0 24 24"
              >
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
              PAUSE
            </button>
          )
        )}

        {/* Initial Play Button (Disabled) */}
        {!isConnected && !onReplay && (
          <button 
            onClick={onPlay}
            disabled={true}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              borderRadius: "4px",
              fontWeight: 700,
              fontSize: "11px",
              border: "none",
              cursor: "not-allowed",
              background: "#1A1A1A",
              color: "#4A4A4A",
              letterSpacing: "0.5px"
            }}
          >
            <svg 
              style={{ width: "10px", height: "10px" }}
              fill="currentColor" 
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z"/>
            </svg>
            PLAY
          </button>
        )}
      </div>
    </div>
  )
}