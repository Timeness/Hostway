import React, { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [userId, setUserId] = useState(new URLSearchParams(window.location.search).get('userId') || '');
  const [appName, setAppName] = useState('');
  const [repoName, setRepoName] = useState('');
  const [appId, setAppId] = useState('');
  const [apps, setApps] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (userId) {
      axios.get(`http://localhost:3000/apps?userId=${userId}`)
        .then(response => setApps(response.data || []))
        .catch(() => setApps([]));
    }
  }, [userId]);

  const handleCreateApp = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:3000/apps', { userId, appName });
      setApps([...apps, { id: response.data.appId, app_name: appName, status: 'created' }]);
      setAppName('');
    } catch (error) {
      setStatus('Error creating app');
    }
  };

  const handleDeploy = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:3000/deploy', { userId, appId, repoName });
      setStatus(response.data.status);
      setApps(apps.map(app => app.id === appId ? { ...app, status: 'running', repo_name: repoName } : app));
      setRepoName('');
      setAppId('');
    } catch (error) {
      setStatus('Error deploying app');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">Hostway</h1>
      {!userId ? (
        <a href="http://localhost:3000/auth/github" className="bg-blue-500 text-white px-4 py-2 rounded mb-4 inline-block">
          Login with GitHub
        </a>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h2 className="text-2xl mb-4">Create App</h2>
            <form onSubmit={handleCreateApp}>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="App Name"
                className="border p-2 w-full mb-4"
              />
              <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded">Create</button>
            </form>
          </div>
          <div>
            <h2 className="text-2xl mb-4">Deploy App</h2>
            <form onSubmit={handleDeploy}>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="App ID"
                className="border p-2 w-full mb-4"
              />
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="Repository Name"
                className="border p-2 w-full mb-4"
              />
              <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">Deploy</button>
            </form>
            {status && <p className="mt-4">{status}</p>}
          </div>
        </div>
      )}
      <h2 className="text-2xl mt-8 mb-4">Your Apps</h2>
      <ul>
        {apps.map(app => (
          <li key={app.id} className="mb-2">{app.app_name} - Status: {app.status} {app.repo_name && `- Repo: ${app.repo_name}`}</li>
        ))}
      </ul>
      <style>{`
        @import 'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css';
      `}</style>
    </div>
  );
}

export default App;
