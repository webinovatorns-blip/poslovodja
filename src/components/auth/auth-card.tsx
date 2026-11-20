import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl">{title}</h1>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
        {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
