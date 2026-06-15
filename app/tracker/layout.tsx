import { Providers } from "@/components/Providers";

export default function TrackerLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
