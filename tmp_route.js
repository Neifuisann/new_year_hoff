app.get('/leaderboard', (req, res) => res.sendFile(path.join(process.cwd(), 'views', 'leaderboard.html')));
