import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { attireFor, isWomansVoice } from "./attire";
import { makePerson } from "./people";
import { SEED_TASK_PACKS, ERRAND_COLOURS } from "./tasks";
import { SEED_DISTRICTS } from "./districts";

const cityOf = (id: string) => SEED_DISTRICTS.find((d) => d.id === id)!.theme.landmark;

test("every errand host is dressed for their voice and their job", () => {
  for (const pack of SEED_TASK_PACKS) {
    const city = cityOf(pack.districtId);
    for (const t of pack.tasks) {
      const a = attireFor(t, city, 1);
      assert.equal(a.female, isWomansVoice(t.speaker), `${t.id}: dressed against their voice`);
      if (a.female) assert.ok(a.preset === "sari" || a.preset === "salwar_kameez", `${t.id}: a woman in ${a.preset}`);
      else assert.notEqual(a.preset, "sari", `${t.id}: a man in a sari`);
      const kit = a.kit ?? [];
      if (t.kind === "auto" && !a.female) {
        assert.equal(a.preset, "shirt_trousers", `${t.id}: auto driver out of uniform`);
        assert.ok(kit.includes("towel"));
      }
      if (t.kind === "bus") assert.ok(kit.includes("ticketBag"), `${t.id}: conductor without the cash bag`);
      if (t.kind === "counter") assert.ok(kit.includes("lanyard"), `${t.id}: clerk without an ID`);
      if (city === "amritsar" && !a.female) assert.equal(a.headwear, "turban", `${t.id}: bareheaded in Amritsar`);
      assert.equal(a.carryProp, false, "a host with a random bag");
    }
  }
  // The Golden Temple's sevadar has a covered head, whoever they are.
  const langar = SEED_TASK_PACKS.find((p) => p.districtId === "hall-bazaar")!.tasks.find((t) => t.id === "hall-bazaar-langar")!;
  assert.ok(["turban", "dupatta"].includes(attireFor(langar, "amritsar", 1).headwear!));
  // Delhi's autos are grey, Mumbai's khaki.
  const auto = { role: "Auto Driver", kind: "auto", speaker: "vijay" };
  assert.notEqual(attireFor(auto, "delhi", 1).cloth1, attireFor(auto, "mumbai", 1).cloth1);
});

test("makePerson honours the sex, headwear and work kit it is given", () => {
  const count = (g: THREE.Object3D) => {
    let n = 0;
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? n++ : 0));
    return n;
  };
  const plain = makePerson({ preset: "shirt_trousers", seed: 7, carryProp: false });
  const kitted = makePerson({ preset: "shirt_trousers", seed: 7, carryProp: false, kit: ["ticketBag", "towel"], headwear: "turban", headColour: 0xff9933 });
  // The bag, its punch, the towel and its stripe, and the turban: each its own colour.
  assert.equal(count(kitted) - count(plain), 5);
  // Same seed, same person underneath: the kit adds, it doesn't reshuffle.
  const box = (g: THREE.Object3D) => new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  assert.ok(Math.abs(box(kitted).y - box(plain).y) < 0.1);
  const woman = makePerson({ preset: "shirt_trousers", seed: 3, female: true, carryProp: false });
  const man = makePerson({ preset: "shirt_trousers", seed: 3, female: false, carryProp: false });
  assert.notDeepEqual(box(woman).toArray(), box(man).toArray(), "the sex override did nothing");
});

test("each errand has its own colour, the same slot the same colour in every city", () => {
  for (const pack of SEED_TASK_PACKS) {
    const colours = pack.tasks.map((t) => t.colour);
    assert.equal(new Set(colours).size, colours.length, `${pack.districtId}: two errands share a colour`);
    colours.forEach((c, i) => assert.equal(c, ERRAND_COLOURS[i], `${pack.tasks[i].id} off the palette`));
  }
});
