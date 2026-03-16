import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import router from "./routes";

const app: Express = express();

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Skip auth middleware in development for testing
if (process.env.NODE_ENV === "production") {
  app.use(authMiddleware);
} else {
  // Dev mode: inject mock user
  app.use((req, res, next) => {
    req.user = { id: "dev-user", email: "dev@example.com" };
    req.isAuthenticated = () => true;
    next();
  });
}

app.use("/api", router);

export default app;
