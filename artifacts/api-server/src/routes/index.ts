import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import draftsRouter from "./drafts";
import scrapeRouter from "./scrape";
import statsRouter from "./stats";
import usersRouter from "./users";
import knowledgeBaseRouter from "./knowledgeBase";
import cronRouter from "./cron";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(draftsRouter);
router.use(scrapeRouter);
router.use(statsRouter);
router.use(usersRouter);
router.use(knowledgeBaseRouter);
router.use(cronRouter);

export default router;
