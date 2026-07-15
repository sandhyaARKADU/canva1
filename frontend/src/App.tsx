import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Dashboard } from './components/dashboard/Dashboard';
import Editor from './Editor';
import { AuthPages } from './components/auth/AuthPages';
import { apiFetch, getAuthToken } from './services/apiClient';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = typeof window !== 'undefined' && window.localStorage ? getAuthToken() : null;
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

// Public view page for shared designs
const SharedViewPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [projectData, setProjectData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchShared = async () => {
      try {
        const res = await apiFetch(`/api/shared/by-token/${token}`, { auth: false });
        if (res.ok) {
          const data = await res.json();
          setProjectData(data);
        } else {
          setError('Design not found or link has expired');
        }
      } catch {
        setError('Unable to load design');
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchShared();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-400 text-sm">Loading design...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 text-sm mb-4">{error}</p>
          <a href="/" className="text-violet-400 text-sm hover:underline">Go to TECKSTUDIO</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-8">
      <h1 className="text-xl font-bold text-zinc-100 mb-2">{projectData?.project_name}</h1>
      <p className="text-zinc-500 text-sm mb-6">Shared via TECKSTUDIO</p>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center max-w-md">
        <p className="text-zinc-400 text-sm">This design can be viewed in the editor.</p>
        <a href={`/editor/${projectData?.project_id}`} className="mt-4 inline-block bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          Open in Editor
        </a>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPages />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/editor/:id" element={<ProtectedRoute><Editor /></ProtectedRoute>} />
        <Route path="/view/:token" element={<SharedViewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
