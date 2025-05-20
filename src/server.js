const express = require('express');
const { Low, JSONFile } = require('lowdb');
const { Octokit } = require('@octokit/rest');
const yaml = require('js-yaml');
const fs = require('fs').promises;
const { exec } = require('child_process');
const util = require('util');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('build'));

const execPromise = util.promisify(exec);

const adapter = new JSONFile('src/db.json');
const db = new Low(adapter);
db.read().then(() => {
  db.data = db.data || {
    users: [],
    apps: [],
    approved_packages: [
      { language: 'python', package_name: 'requests' },
      { language: 'javascript', package_name: 'express' },
      { language: 'ruby', package_name: 'rails' },
      { language: 'go', package_name: 'gin' },
      { language: 'php', package_name: 'laravel' },
    ],
  };
  db.write();
});

const supportedLanguages = {
  python: 'python:3.13',
  javascript: 'node:20',
  typescript: 'node:20',
  ruby: 'ruby:3.3',
  go: 'golang:1.22',
  php: 'php:8.2',
};

app.get('/auth/github', (req, res) => {
  const url = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${process.env.GITHUB_REDIRECT_URI}&scope=repo`;
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const response = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }, { headers: { Accept: 'application/json' } });
    const { access_token } = response.data;

    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${access_token}` },
    });
    const { id: githubId, login: githubUsername } = userResponse.data;
    const existingUser = db.data.users.find(user => user.github_id === githubId.toString());
    if (existingUser) {
      existingUser.github_token = access_token;
    } else {
      db.data.users.push({ id: Date.now().toString(), github_id: githubId.toString(), github_token: access_token, github_username: githubUsername });
    }
    await db.write();

    res.redirect(`http://localhost:3000?userId=${existingUser ? existingUser.id : db.data.users[db.data.users.length - 1].id}`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/apps', async (req, res) => {
  const { userId, appName } = req.body;
  try {
    const appId = Date.now().toString();
    db.data.apps.push({ id: appId, user_id: userId, app_name: appName, plan: 'free', status: 'created', repo_name: null, logs: '' });
    await db.write();
    res.json({ appId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/apps', async (req, res) => {
  const { userId } = req.query;
  try {
    const apps = db.data.apps.filter(app => app.user_id === userId);
    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/deploy', async (req, res) => {
  const { userId, appId, repoName } = req.body;
  try {
    const user = db.data.users.find(user => user.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const octokit = new Octokit({ auth: user.github_token });
    const { data } = await octokit.repos.getContent({
      owner: user.github_username,
      repo: repoName,
      path: 'hostway.yml',
    });
    const config = yaml.load(Buffer.from(data.content, 'base64').toString());
    if (!supportedLanguages[config.language]) {
      return res.status(400).json({ error: 'Unsupported language' });
    }

    const approvedPackages = db.data.approved_packages
      .filter(pkg => pkg.language === config.language)
      .map(pkg => pkg.package_name);
    if (!config.commands.package.every(pkg => approvedPackages.includes(pkg))) {
      return res.status(400).json({ error: 'Unapproved packages detected' });
    }
    await fs.mkdir('deployments', { recursive: true });
    await fs.mkdir(`deployments/app_${appId}`, { recursive: true });
    await execPromise(`git clone https://github.com/${user.github_username}/${repoName}.git deployments/app_${appId}/repo`);

    const dockerfile = `
FROM ${supportedLanguages[config.language]}
WORKDIR /app
COPY ./repo .
${config.commands.build.map(cmd => `RUN ${cmd}`).join('\n')}
CMD ${config.commands.start.join(' && ')}
`;
    await fs.writeFile(`deployments/app_${appId}/Dockerfile`, dockerfile);
    await execPromise(`docker build -t hostway-${appId} deployments/app_${appId}`);
    await execPromise(`docker run -d --name hostway-${appId} --cpu-shares=512 --memory=512m ${config.env ? config.env.map(e => `-e ${e}`).join(' ') : ''} hostway-${appId}`);
    const app = db.data.apps.find(app => app.id === appId);
    app.status = 'running';
    app.repo_name = repoName;
    await db.write();

    await execPromise(`rm -rf deployments/app_${appId}/repo`);

    res.json({ status: 'Online ✅' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'build' });
});

app.listen(3000, () => console.log('Runn on: 3000'));
