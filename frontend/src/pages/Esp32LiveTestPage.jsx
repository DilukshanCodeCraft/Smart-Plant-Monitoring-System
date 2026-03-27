import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { SectionCard } from '../components/SectionCard';
import { api } from '../lib/api';

export default function Esp32LiveTestPage() {
  const [board1, setBoard1] = useState({ data: null, error: null, loading: true });
  const [board2, setBoard2] = useState({ data: null, error: null, loading: true });
  const [refreshInterval, setRefreshInterval] = useState(3000);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);

  async function applyRoomOverride(room) {
    const toastId = toast.loading('Simulating plant movement...');
    try {
      await api.setSecondaryRoomOverride(room);
      if (room) {
        toast.success(`Movement Detected! 🪴 Plant relocated to: ${room}`, { id: toastId, duration: 6000 });
      } else {
        toast.success('Override cleared. 📍 Routing back to live BLE locations.', { id: toastId, duration: 4000 });
      }
      fetchStatuses();
    } catch (err) {
      toast.error(err.message, { id: toastId });
    }
  }

  async function fetchStatuses() {
    try {
      const b1 = await api.sendDeviceCommand('/device/status');
      setBoard1({ data: b1, error: null, loading: false });
    } catch (err) {
      setBoard1({ data: null, error: err.message, loading: false });
    }

    try {
      const b2 = await api.getSecondaryBoardStatus();
      setBoard2({ data: b2, error: null, loading: false });
    } catch (err) {
      setBoard2({ data: null, error: err.message, loading: false });
    }
  }

  useEffect(() => {
    fetchStatuses();
    
    if (!isAutoRefresh) return;
    
    const interval = setInterval(() => {
      fetchStatuses();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [isAutoRefresh, refreshInterval]);

  async function handleCommand(path, label) {
    const toastId = toast.loading(`Sending ${label}...`);
    try {
      const res = await api.sendDeviceCommand(path);
      toast.success(`${label} Success: ${res.message || 'Done'}`, { id: toastId });
      fetchStatuses();
    } catch (err) {
      toast.error(`${label} Failed: ${err.message}`, { id: toastId });
    }
  }

  return (
    <main className="app-shell">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">ESP32 Live Dual-Board Test</h1>
            <p className="page-subtitle">Real-time sync test for Main Board (WiFi) & Lux/BLE Node (Serial).</p>
          </div>
          <div className="section-card__actions" style={{ alignItems: 'center', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <input 
                type="checkbox" 
                checked={isAutoRefresh} 
                onChange={e => setIsAutoRefresh(e.target.checked)} 
              />
              Auto-Refresh
            </label>
            <select 
              value={refreshInterval} 
              onChange={e => setRefreshInterval(Number(e.target.value))}
              disabled={!isAutoRefresh}
              className="form-input"
              style={{ padding: '0.25rem 0.5rem', width: 'auto' }}
            >
              <option value={1000}>1s</option>
              <option value={3000}>3s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
            </select>
            <button className="btn btn--primary" onClick={fetchStatuses}>Force Refresh</button>
          </div>
        </div>

        <div className="dashboard-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
          
          {/* BOARD 1 COLUMN */}
          <SectionCard title="Board 1 (Sensors & Actuators)" eyebrow="WiFi / HTTP POST">
            <div className="diag-stats" style={{ marginBottom: '1rem' }}>
              <div className="diag-stat"><label>Status</label><strong>{board1.error ? 'Offline' : (board1.loading ? '...' : 'Reachable')}</strong></div>
              <div className="diag-stat"><label>Monitoring</label><strong>{board1.data?.deviceStatus?.monitoring ? 'ON' : 'OFF'}</strong></div>
              <div className="diag-stat"><label>Session ID</label><strong>{board1.data?.deviceStatus?.monitoringSessionId || '-'}</strong></div>
              <div className="diag-stat"><label>Current Round</label><strong>{board1.data?.deviceStatus?.currentRound || '0'} / 10</strong></div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              <button className="btn btn--ghost" onClick={() => handleCommand('/device/monitor/on', 'Board 1 Monitor ON')}>Start Batch</button>
              <button className="btn btn--ghost" onClick={() => handleCommand('/device/monitor/off', 'Board 1 Monitor OFF')}>Stop Batch</button>
              <button className="btn btn--ghost" onClick={() => handleCommand('/device/light/on', 'Light ON')}>💡 Light ON</button>
              <button className="btn btn--ghost" onClick={() => handleCommand('/device/light/off', 'Light OFF')}>💡 OFF</button>
            </div>

            <label className="chart-title">Live Sensor Snapshot</label>
            {board1.error ? (
              <p className="form-error">{board1.error}</p>
            ) : (
              <pre className="json-preview" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {JSON.stringify(board1.data?.deviceStatus?.latestRound || {}, null, 2)}
              </pre>
            )}
            
            <label className="chart-title" style={{ marginTop: '1rem' }}>Full Response</label>
            <pre className="json-preview" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {JSON.stringify(board1.data || {}, null, 2)}
            </pre>
          </SectionCard>

          {/* BOARD 2 COLUMN */}
          <SectionCard title="Board 2 (BH1750 Lux & BLE)" eyebrow="USB Serial (COM)">
            <div className="diag-stats" style={{ marginBottom: '1rem' }}>
              <div className="diag-stat"><label>Status</label><strong>{board2.data?.status?.connected ? 'Connected' : 'Disconnected'}</strong></div>
              <div className="diag-stat"><label>Stale?</label><strong>{board2.data?.status?.isStale ? 'YES' : 'NO'}</strong></div>
              <div className="diag-stat"><label>Monitoring</label><strong>{board2.data?.status?.monitoringEnabled ? 'ON' : 'OFF'}</strong></div>
              <div className="diag-stat"><label>Age</label><strong>{board2.data?.status?.lastSeenAgeMs || 0} ms</strong></div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              <button className="btn btn--ghost" onClick={() => handleCommand('/device/secondary/monitor/on', 'Board 2 Monitor ON')}>Start Tracking</button>
              <button className="btn btn--ghost" onClick={() => handleCommand('/device/secondary/monitor/off', 'Board 2 Monitor OFF')}>Stop Tracking</button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className={`btn ${board2.data?.status?.manualRoomOverride === 'Living room' ? 'btn--primary' : 'btn--ghost'}`} style={{flex: 1}} onClick={() => applyRoomOverride('Living room')}>Living Room</button>
              <button className={`btn ${board2.data?.status?.manualRoomOverride === 'Bed room' ? 'btn--primary' : 'btn--ghost'}`} style={{flex: 1}} onClick={() => applyRoomOverride('Bed room')}>Bed Room</button>
              <button className={`btn ${board2.data?.status?.manualRoomOverride === 'Library' ? 'btn--primary' : 'btn--ghost'}`} style={{flex: 1}} onClick={() => applyRoomOverride('Library')}>Library</button>
              <button className="btn btn--ghost" onClick={() => applyRoomOverride('')} style={{border: '1px solid #ef4444', color: '#ef4444'}}>Clear</button>
            </div>

            <label className="chart-title">Round Buffers (Aggregated for Batch)</label>
            {board2.error ? (
              <p className="form-error">{board2.error}</p>
            ) : (
              <pre className="json-preview" style={{ maxHeight: '300px', overflowY: 'auto', background: '#f8fafc', color: '#0f172a', borderLeft: '3px solid #3b82f6' }}>
                {JSON.stringify(board2.data?.status?.rounds?.filter(Boolean) || [], null, 2)}
              </pre>
            )}

            <label className="chart-title" style={{ marginTop: '1rem' }}>Live Serial Parsing</label>
            <div className="diag-stats" style={{ marginBottom: '1rem', background: '#1e293b', border: 'none', color: '#f8fafc' }}>
              <div className="diag-stat"><label style={{ color: '#94a3b8' }}>Live Lux</label><strong>{board2.data?.status?.lux?.toFixed(2) || '-'}</strong></div>
              <div className="diag-stat"><label style={{ color: '#94a3b8' }}>Location</label><strong>{board2.data?.status?.nearestRoom || '-'}</strong></div>
              <div className="diag-stat"><label style={{ color: '#94a3b8' }}>Beacon</label><strong>{board2.data?.status?.nearestBeacon || '-'}</strong></div>
            </div>

            <label className="chart-title">Full Response</label>
            <pre className="json-preview" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {JSON.stringify(board2.data || {}, null, 2)}
            </pre>
          </SectionCard>

        </div>
      </div>
    </main>
  );
}
