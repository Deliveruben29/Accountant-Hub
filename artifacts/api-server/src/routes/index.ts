import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import accountsRouter from "./accounts";
import transactionsRouter from "./transactions";
import statementsRouter from "./statements";
import dashboardRouter from "./dashboard";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(accountsRouter);
router.use(transactionsRouter);
router.use(statementsRouter);
router.use(dashboardRouter);
router.use(usersRouter);

export default router;
