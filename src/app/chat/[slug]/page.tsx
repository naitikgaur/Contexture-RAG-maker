import type { Metadata } from "next";
import { PublicChat } from "@/components/PublicChat";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Assistant · ${slug}`, description: "Ask this company knowledge assistant a question." };
}

export default async function PublicChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicChat slug={slug} />;
}
