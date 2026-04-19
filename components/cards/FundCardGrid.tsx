"use client";

import { motion } from "motion/react";
import { FundCard } from "./FundCard";
import type { Member, ProductType } from "@/lib/types";

interface Fund {
  id: string;
  provider: string;
  product_name: string;
  product_type: ProductType;
  balance: number | null;
  monthly_return_pct: number | null;
  member?: Pick<Member, "name" | "avatar_color"> | null;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export function FundCardGrid({ funds }: { funds: Fund[] }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-2 md:space-y-0 md:grid md:grid-cols-2 md:gap-3"
    >
      {funds.map((fund) => (
        <motion.div key={fund.id} variants={itemVariants}>
          <FundCard
            provider={fund.provider}
            productName={fund.product_name}
            productType={fund.product_type}
            balance={fund.balance || 0}
            monthlyReturnPct={fund.monthly_return_pct}
            member={fund.member}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
