import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '../components/SectionCard';
import { api } from '../lib/api';

const POLL_INTERVAL_MS = 8000;

function buildBoards() {
  return [
    {
      id: 'board-a',
      title: 'ESP32 Main Board',
      description: 'Sensors + actuator control board',
      source: 'network-board'
    },
    {
      id: 'board-b',
      title: 'ESP32 Lux Board',
      description: 'BH1750 lux board',
      source: 'usb-serial-board'
    }
  ];
}

async function fetchBoardStatus(board) {
  if (board.source === 'network-board') {
    // Return full payload so 'ok' field is preserved
    return await api.sendDeviceCommand('/device/status');
  }

  return await api.getSecondaryBoardStatus();
}

function getPowerStateLabel(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'ON' : 'OFF';
  }
  return '-';
}

export default function Esp32BoardsStatusPage() {
  const boards = useMemo(() => buildBoards(), []);
  const [statusByBoard, setStatusByBoard] = useState({});
  const [loading, setLoading] = useState(true);

  async function loadStatuses() {
    if (loading) {
      setLoading(true);
    }

    const responses = await Promise.allSettled(
      boards.map(async (board) => {
        const data = await fetchBoardStatus(board.url);
        return {
          id: board.id,
          ok: true,
          data,
          fetchedAt: Date.now(),
          error: null
        };
      })
    );

    const nextState = {};
    responses.forEach((result, index) => {
      const board = boards[index];

      if (result.status === 'fulfilled') {
        nextState[board.id] = result.value;
      } else {
        nextState[board.id] = {
          id: board.id,
          ok: false,
          data: null,
          fetchedAt: Date.now(),
          error: result.reason?.message || 'Unable to load board status.'
        };
      }
    });

    setStatusByBoard(nextState);
    setLoading(false);
  }

  useEffect(() => {
    loadStatuses();

    const intervalId = setInterval(() => {
      loadStatuses();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const onlineCount = boards.reduce((count, board) => {
    return count + (statusByBoard[board.id]?.ok ? 1 : 0);
  }, 0);

  return (
    <main className="app-shell">
      <div className="page-container diagnostics-layout esp32-boards-layout">
        <div className="page-header">
          <div>
            <h1 className="page-title">ESP32 Boards Status</h1>
            <p className="page-subtitle">Live status for both boards with auto-refresh every 8 seconds.</p>
          </div>
          <div className="section-card__actions">
            <span className={`status-chip ${onlineCount === boards.length ? 'status-chip--reachable' : 'status-chip--warn'}`}>
              <span className="status-chip__dot" aria-hidden="true" />
              {onlineCount}/{boards.length} online
            </span>
            <button className="btn btn--ghost" onClick={loadStatuses}>Refresh now</button>
          </div>
        </div>

        {loading && <div className="loading-banner">Loading board statuses...</div>}

        <div className="esp32-boards-grid">
          {boards.map((board) => {
            const status = statusByBoard[board.id];
            const isOnline = Boolean(status?.ok);
            const data = status?.data;

            return (
              <SectionCard
                key={board.id}
                title={board.title}
                eyebrow={board.description}
                className="diag-card esp32-board-card"
                actions={(
                  <span className={`status-chip ${isOnline ? 'status-chip--reachable' : 'status-chip--offline'}`}>
                    <span className="status-chip__dot" aria-hidden="true" />
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                )}
              >
                <div className="diag-stats">
                  <div className="diag-stat">
                    <label>Source</label>
                    <strong>{board.source === 'network-board' ? 'ESP32 HTTP API' : 'USB Serial (COM)'}</strong>
                  </div>
                  <div className="diag-stat">
                    <label>Device ID</label>
                    <strong>{data?.deviceId || (board.source === 'usb-serial-board' ? 'USB serial parser' : '-')}</strong>
                  </div>
                  <div className="diag-stat">
                    <label>IP Address</label>
                    <strong>{data?.ip || '-'}</strong>
                  </div>
                  <div className="diag-stat">
                    <label>WiFi</label>
                    <strong>{typeof data?.wifiConnected === 'boolean' ? (data.wifiConnected ? 'Connected' : 'Disconnected') : (board.source === 'usb-serial-board' ? 'N/A (USB)' : '-')}</strong>
                  </div>
                  <div className="diag-stat">
                    <label>Monitoring</label>
                    <strong>{typeof data?.monitoring === 'boolean' ? (data.monitoring ? 'ON' : 'OFF') : '-'}</strong>
                  </div>
                  <div className="diag-stat">
                    <label>{board.source === 'usb-serial-board' ? 'Port' : 'Session ID'}</label>
                    <strong>{board.source === 'usb-serial-board' ? (data?.portPath || '-') : (data?.monitoringSessionId || '-')}</strong>
                  </div>
                </div>

                <div className="diag-stats esp32-board-card__actuators">
                  {board.source === 'network-board' ? (
                    <>
                      <div className="diag-stat"><label>Light</label><strong>{getPowerStateLabel(data?.light)}</strong></div>
                      <div className="diag-stat"><label>Fan</label><strong>{getPowerStateLabel(data?.fan)}</strong></div>
                      <div className="diag-stat"><label>Water</label><strong>{getPowerStateLabel(data?.water)}</strong></div>
                      <div className="diag-stat"><label>Pest</label><strong>{getPowerStateLabel(data?.pest)}</strong></div>
                      <div className="diag-stat"><label>Nutri</label><strong>{getPowerStateLabel(data?.nutri)}</strong></div>
                      <div className="diag-stat"><label>Rounds Captured</label><strong>{typeof data?.roundsCaptured === 'number' ? data.roundsCaptured : '-'}</strong></div>
                    </>
                  ) : (
                    <>
                      <div className="diag-stat"><label>BH1750 Lux</label><strong>{typeof data?.lux === 'number' ? `${data.lux.toFixed(2)} lx` : '-'}</strong></div>
                      <div className="diag-stat"><label>Nearest Beacon</label><strong>{data?.nearestBeacon || '-'}</strong></div>
                      <div className="diag-stat"><label>Location</label><strong>{data?.nearestRoom || '-'}</strong></div>
                      <div className="diag-stat"><label>RSSI A</label><strong>{typeof data?.rssiA === 'number' ? data.rssiA : '-'}</strong></div>
                      <div className="diag-stat"><label>RSSI B</label><strong>{typeof data?.rssiB === 'number' ? data.rssiB : '-'}</strong></div>
                      <div className="diag-stat"><label>RSSI C</label><strong>{typeof data?.rssiC === 'number' ? data.rssiC : '-'}</strong></div>
                    </>
                  )}
                </div>

                {status?.error ? <p className="form-error">{status.error}</p> : null}
                {status?.fetchedAt ? <p className="empty-inline">Updated: {new Date(status.fetchedAt).toLocaleTimeString()}</p> : null}
                {data ? <pre className="json-preview">{JSON.stringify(data, null, 2)}</pre> : null}
              </SectionCard>
            );
          })}
        </div>
      </div>
    </main>
  );
}