const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

async function request(path, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(500, Number(options.timeoutMs)) : 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Request timeout'));
  }, timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      },
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage = payload?.message || payload?.error || `Request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  return payload;
}

export const api = {
  getDashboardOverview() {
    return request('/dashboard/overview');
  },
  getCameraRoll(params = {}) {
    return request(`/camera-roll${buildQueryString(params)}`);
  },
  getCameraMediaCategories() {
    return request('/camera-roll/categories');
  },
  uploadCameraMedia({ file, category, source, context } = {}) {
    const formData = new FormData();

    if (file) {
      formData.append('file', file);
    }

    if (source) {
      formData.append('source', source);
    }

    if (context) {
      formData.append('context', context);
    }

    return request(`/camera-roll/upload${buildQueryString({ category })}`, {
      method: 'POST',
      body: formData
    });
  },
  getLatestReading() {
    return request('/readings/latest');
  },
  getReadings(params = {}) {
    return request(`/readings${buildQueryString(params)}`);
  },
  deleteReadings(payload) {
    return request('/readings', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  },
  sendDeviceCommand(path) {
    const separator = path.includes('?') ? '&' : '?';
    return request(`${path}${separator}_ts=${Date.now()}`, {
      cache: 'no-store',
      timeoutMs: 4500
    });
  },
  detectArthropods(formData) {
    // formData should contain 'file' (File object) and optionally 'confidence' (number)
    return request('/arthropod/detect', {
      method: 'POST',
      body: formData
      // Don't set Content-Type header; browser will set it with boundary
    });
  },

  // ── Plants ──────────────────────────────────────────────────────────────────
  getPlants() {
    return request('/plants');
  },
  getPlant(id) {
    return request(`/plants/${id}`);
  },
  createPlant(data) {
    return request('/plants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  updatePlant(id, data) {
    return request(`/plants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  archivePlant(id) {
    return request(`/plants/${id}`, { method: 'DELETE' });
  },

  // ── Alerts ───────────────────────────────────────────────────────────────────
  getAlerts(params = {}) {
    return request(`/alerts${buildQueryString(params)}`);
  },
  acknowledgeAlert(id) {
    return request(`/alerts/${id}/acknowledge`, { method: 'PATCH' });
  },
  resolveAlert(id) {
    return request(`/alerts/${id}/resolve`, { method: 'PATCH' });
  },
  reevaluateLatestReading() {
    return request('/alerts/re-evaluate-latest', { method: 'POST' });
  },

  // ── Recommendations ──────────────────────────────────────────────────────────
  getRecommendations(params = {}) {
    return request(`/recommendations${buildQueryString(params)}`);
  },
  dismissRecommendation(id) {
    return request(`/recommendations/${id}/dismiss`, { method: 'PATCH' });
  },

  // ── Journal ───────────────────────────────────────────────────────────────────
  getJournal(params = {}) {
    return request(`/journal${buildQueryString(params)}`);
  },
  createJournalEntry(data) {
    return request('/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  deleteJournalEntry(id) {
    return request(`/journal/${id}`, { method: 'DELETE' });
  },

  // ── Profile / Onboarding ─────────────────────────────────────────────────────
  getProfile() {
    return request('/profile');
  },
  updateProfile(data) {
    return request('/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  completeOnboarding(data) {
    return request('/profile/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  // ── Actuators ────────────────────────────────────────────────────────────────
  triggerActuator(actuator, state, plantId) {
    return request(`/actuators/${actuator}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, plantId })
    });
  },
  getActuatorLogs(params = {}) {
    return request(`/actuators/logs${buildQueryString(params)}`);
  },

  // ── KBA ──────────────────────────────────────────────────────────────────────
  getKBAArticles(params = {}) {
    return request(`/kba/articles${buildQueryString(params)}`);
  },
  getKBAArticle(slug) {
    return request(`/kba/articles/${slug}`);
  },

  // ── Diagnostics ───────────────────────────────────────────────────────────────
  getDiagnostics() {
    return request('/diagnostics');
  },
  getSecondaryBoardStatus() {
    return request('/device/secondary/status');
  },
  setSecondaryRoomOverride(room) {
    return request('/device/secondary/override-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room })
    });
  },
  getLiveNotifications() {
    return request('/notifications/live');
  },
  getTelegramNotificationStatus() {
    return request('/notifications/telegram/status');
  },
  sendLatestTelegramReading() {
    return request('/notifications/telegram/send-latest', {
      method: 'POST'
    });
  },
  getSimulationStatus() {
    return request('/simulation/status');
  },
  startSimulation() {
    return request('/simulation/start', { method: 'POST' });
  },
  stopSimulation() {
    return request('/simulation/stop', { method: 'POST' });
  },

  // ── Automation Rules ───────────────────────────────────────────────────────
  getAutomationRules() {
    return request('/automation-rules');
  },
  createAutomationRule(data) {
    return request('/automation-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  updateAutomationRule(id, data) {
    return request(`/automation-rules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  deleteAutomationRule(id) {
    return request(`/automation-rules/${id}`, { method: 'DELETE' });
  },

  // ── Chat ───────────────────────────────────────────────────────────────────
  getLatestChat() {
    return request('/chat/latest');
  },
  createChat(data) {
    return request('/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },
  addChatMessage(chatId, message) {
    return request(`/chat/conversations/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
  },

  // ── ML / Predictive Care ──────────────────────────────────────────────────
  getMLPrediction() {
    return request('/ml/predict');
  },
  getMLPlots() {
    return request('/ml/plots/list');
  }
};
