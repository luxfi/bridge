import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { allowedOrigin, port } from '@/config';
import { sequelize } from '@/model';
import router from '@/routes';

const corsOptions = {
  origin: allowedOrigin,
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
};

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: corsOptions,
});

io.on('connection', socket => {
  console.log('a user connected');
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});
app.use((req: any, res: any, next) => {
  req.io = io;
  next();
});

app.use(express.json());
app.use(helmet());
app.use(
  cors({
    origin: allowedOrigin,
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
  }),
);

app.use('/api', router);

sequelize.sync();

server.listen(port, () => {
  console.log(`Server is running on port ${port}.`);
});
