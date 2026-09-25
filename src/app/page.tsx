import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import { Stats, TopicsMarquee } from "@/components/Proof";
import HowItWorks from "@/components/HowItWorks";
import Studio from "@/components/Studio";
import Features from "@/components/Features";
import Voices from "@/components/Voices";
import Testimonials from "@/components/Testimonials";
import Faq from "@/components/Faq";
import Cta from "@/components/Cta";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="relative">
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <HowItWorks />
        <Studio />
        <Features />
        <Voices />
        <TopicsMarquee />
        <Testimonials />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
