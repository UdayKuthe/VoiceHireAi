const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('voicehire_token');
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const config = {
    ...options,
    headers
  };

  if (config.body && typeof config.body === 'object' && !isFormData) {
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
    if (response.status === 401 && !endpoint.includes('/auth/login')) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('voicehire:unauthorized'));
      }
    }
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

  // Recruiter Phase 1
  getCandidates: () => request('/api/candidates', { method: 'GET' }),
  createInterview: (body) => request('/api/interviews', { method: 'POST', body }),
  getRecruiterInterviews: () => request('/api/interviews', { method: 'GET' }),
  setRecruiterReady: (id, ready) => request(`/api/interviews/${id}/ready`, { method: 'PATCH', body: { ready } }),
  updateInterviewStatus: (id, status) => request(`/api/interviews/${id}/status`, { method: 'PATCH', body: { status } }),

  // Candidate Phase 1
  getCandidateInterviews: () => request('/api/candidate/interviews', { method: 'GET' }),
  joinInterview: (id) => request(`/api/candidate/interviews/${id}/join`, { method: 'POST' }),

  // Recruiter Phase 2: Resume / JD Upload, Extraction, Mapping & Planning
  uploadResume: (interviewId, formData) => request(`/api/interviews/${interviewId}/resume`, { method: 'POST', body: formData }),
  uploadJd: (interviewId, formData) => request(`/api/interviews/${interviewId}/jd`, { method: 'POST', body: formData }),
  extractDocs: (interviewId) => request(`/api/interviews/${interviewId}/extract`, { method: 'POST' }),
  mapSkills: (interviewId) => request(`/api/interviews/${interviewId}/map`, { method: 'POST' }),
  generatePlan: (interviewId) => request(`/api/interviews/${interviewId}/plan`, { method: 'POST' }),
  getAnalysis: (interviewId) => request(`/api/interviews/${interviewId}/analysis`, { method: 'GET' }),
  updateResumeData: (interviewId, data) => request(`/api/interviews/${interviewId}/resume/data`, { method: 'PATCH', body: data }),
  updateJdData: (interviewId, data) => request(`/api/interviews/${interviewId}/jd/data`, { method: 'PATCH', body: data }),
  updatePlan: (interviewId, payload) => {
    const body = Array.isArray(payload)
      ? { sections: payload }
      : (payload?.sections ? payload : { sections: payload?.items || payload });
    return request(`/api/interviews/${interviewId}/plan`, { method: 'PATCH', body });
  },
  overrideProjectPriority: (interviewId, { projectName, priority }) => request(`/api/interviews/${interviewId}/project-priority`, { method: 'PATCH', body: { projectName, priority } })
};

export default api;
