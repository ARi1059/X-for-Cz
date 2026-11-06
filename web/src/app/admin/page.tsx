import { AdminApp } from '../../components/admin-app';
export const metadata = { title: '站点管理', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function AdminPage() { return <AdminApp />; }
