import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountsRouter from "./accounts";
import transactionsRouter from "./transactions";
import statementsRouter from "./statements";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountsRouter);
router.use(transactionsRouter);
router.use(statementsRouter);
router.use(dashboardRouter);

export default router;
