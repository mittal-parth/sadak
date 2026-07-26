import RoznamchaApp from "@/roznamcha/components/RoznamchaApp";

export const metadata = {
  title: "Roznamcha — voice day-book for field health workers",
  description:
    "Speak a household visit in Hindi or Kannada. Interrupt the readback to correct it. File a governed record.",
};

export default function Page() {
  return <RoznamchaApp />;
}
