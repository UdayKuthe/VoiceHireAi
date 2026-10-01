const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('voicehire_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const config = {
    ...options,
    headers
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, config);
  } catch (netErr) {
    throw new Error('Unable to connect to VoiceHire backend server. Please verify the server is running on port 5000.');
  }

  const contentType = response.headers.get('content-type');
  let data = {};
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  // Authentication
  register: (body) => request('/api/auth/register', { method: 'POST', body }),
  login: (body) => request('/api/auth/login', { method: 'POST', body }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  forgotPassword: (email) => request('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (body) => request('/api/auth/reset-password', { method: 'POST', body }),
  getMe: () => request('/api/auth/me', { method: 'GET' }),

  // Recruiter Endpoints
  getCandidates: () => request('/api/candidates', { method: 'GET' }),
  createInterview: (body) => request('/api/interviews', { method: 'POST', body }),
  getRecruiterInterviews: () => request('/api/interviews', { method: 'GET' }),
  setRecruiterReady: (id, ready) => request(`/api/interviews/${id}/ready`, { method: 'PATCH', body: { ready } }),
  updateInterviewStatus: (id, status) => request(`/api/interviews/${id}/status`, { method: 'PATCH', body: { status } }),

  // Candidate Endpoints
  getCandidateInterviews: () => request('/api/candidate/interviews', { method: 'GET' }),
  joinInterview: (id) => request(`/api/candidate/interviews/${id}/join`, { method: 'POST' })
};

export default api;
