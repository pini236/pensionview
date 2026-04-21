import createNextIntlPlugin from "next-intl/plugin";
import { withWorkflow } from "workflow/next";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig = {};

export default withWorkflow(withNextIntl(nextConfig));
