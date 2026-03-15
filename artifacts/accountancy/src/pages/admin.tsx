import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@workspace/replit-auth-web";
import { Shield, Users, UserCheck, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface DBUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
  language: string;
  createdAt: string;
}

interface Stats { total: number; admins: number; users: number }

export default function Admin() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<DBUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const [uRes, sRes] = await Promise.all([
        fetch("/api/users", { credentials: "include" }),
        fetch("/api/users/stats", { credentials: "include" }),
      ]);
      if (uRes.ok) setUsers(await uRes.json());
      if (sRes.ok) setStats(await sRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleRole = async (targetUser: DBUser) => {
    const newRole = targetUser.role === "admin" ? "user" : "admin";
    setUpdating(targetUser.id);
    try {
      const res = await fetch(`/api/users/${targetUser.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error();
      setUsers((prev) => prev.map((u) => u.id === targetUser.id ? { ...u, role: newRole } : u));
      if (stats) setStats({
        ...stats,
        admins: newRole === "admin" ? stats.admins + 1 : stats.admins - 1,
        users: newRole === "user" ? stats.users + 1 : stats.users - 1,
      });
      toast({ title: t("admin.updateSuccess") });
    } catch {
      toast({ title: t("admin.updateError"), variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const getName = (u: DBUser) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">{t("admin.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("admin.subtitle")}</p>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t("admin.totalUsers"), value: stats.total, icon: Users, color: "text-blue-500" },
            { label: t("admin.admins"), value: stats.admins, icon: Shield, color: "text-purple-500" },
            { label: t("admin.regularUsers"), value: stats.users, icon: UserCheck, color: "text-green-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="pt-6 pb-4">
                <div className="flex items-center gap-3">
                  <Icon className={`w-8 h-8 ${color}`} />
                  <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.users")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">{t("admin.loading")}</p>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-4 gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {u.profileImageUrl ? (
                      <img src={u.profileImageUrl} alt={getName(u)} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {getName(u)}
                        {u.id === user?.id && (
                          <span className="ml-2 text-xs text-muted-foreground font-normal">({t("admin.you")})</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                      {u.role}
                    </Badge>
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
                    </span>
                    {u.id !== user?.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updating === u.id}
                        onClick={() => toggleRole(u)}
                        className="text-xs"
                      >
                        {u.role === "admin" ? t("admin.makeUser") : t("admin.makeAdmin")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
