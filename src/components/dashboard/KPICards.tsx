"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, DollarSign, Flame } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import type { DashboardStats } from "@/types";

interface KPICardsProps {
  stats: DashboardStats;
}

export function KPICards({ stats }: KPICardsProps) {
  const cards = [
    {
      title: "Total Contactos",
      value: stats.totalContacts.toString(),
      icon: Users,
      color: "text-info",
      bgColor: "bg-info/10",
    },
    {
      title: "Deals Activos",
      value: stats.activeDeals.toString(),
      icon: Briefcase,
      color: "text-purple",
      bgColor: "bg-purple/10",
    },
    {
      title: "Valor en Pipeline",
      value: formatCurrency(stats.totalPipelineValue),
      icon: DollarSign,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Leads Calientes",
      value: stats.hotLeads.toString(),
      icon: Flame,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={`rounded-lg p-2 ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
