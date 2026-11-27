import * as THREE from "three";
import { RoundedBoxGeometry } from "/vendor/three-examples/geometries/RoundedBoxGeometry.js";
import { surfaceAt, trackAt } from "./track.js";
/** Open working pit bays and the welcome gantry seen from the starting grid. */
export function buildPitlane(
  world,
  { mesh, box, standard, basic, canvasTexture, signTexture },
) {
  const white = standard("#c9cec4", { roughness: 0.8 }),
    dark = standard("#26313b"),
    navy = standard("#393270"),
    steel = standard("#687979", { metalness: 0.65, roughness: 0.36 }),
    yellow = standard("#c8b439"),
    red = standard("#bc3032"),
    rubber = standard("#161c24"),
    inner = standard("#e6e6d2", {
      emissive: "#e6e5ce",
      emissiveIntensity: 0.4,
      roughness: 0.85,
    }),
    glow = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#fff3cc").multiplyScalar(2.4),
    });
  const round = (parent, size, pos, mat, r = 0.1) =>
    mesh(new RoundedBoxGeometry(...size, 1, r), mat, parent, pos);
  const panelMats = new Map();
  const panel = (parent, w, h, pos, map, ry = 0) => {
    let mat = panelMats.get(map.uuid);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ map });
      panelMats.set(map.uuid, mat);
    }
    const m = mesh(
      new THREE.PlaneGeometry(w, h),
      mat,
      parent,
      pos,
    );
    m.rotation.y = ry;
    return m;
  };
  const colours = ["#ed3c46", "#447fda", "#aa5dc9", "#e1bd3a", "#42a16d"];
  const paints = colours.map((c) => standard(c));
  const skin = standard("#edddba"),
    eyes = standard("#172129");
  const unitSphere = new THREE.SphereGeometry(1, 6, 4);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  function attendant(parent, x, y, z, index, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = Math.PI / 2;
    g.scale.setScalar(scale);
    parent.add(g);
    const s = (r, pos, mat, sc = [1, 1, 1]) => {
      const m = mesh(unitSphere, mat, g, pos);
      m.scale.set(r * sc[0], r * sc[1], r * sc[2]);
      return m;
    };
    const b = (dim, pos, mat) => {
      const m = mesh(unitBox, mat, g, pos);
      m.scale.set(...dim);
      return m;
    };
    b([0.46, 0.6, 0.36], [0, 0.46, 0], paints[index % 5]);
    s(0.29, [0, 0.94, 0.02], skin);
    s(0.49, [0, 1.24, 0], white, [1, 0.72, 1]);
    s(0.18, [0, 1.44, 0.35], paints[index % 5], [1, 0.4, 1]);
    for (const side of [-1, 1]) {
      b([0.07, 0.1, 0.06], [side * 0.1, 1.0, 0.28], eyes);
      b([0.16, 0.32, 0.16], [side * 0.29, 0.56, 0.03], skin);
      b([0.2, 0.18, 0.3], [side * 0.14, 0.11, 0.08], dark);
    }
    return g;
  }
  const sponsors = ["MKTV", "MUSHROOM CUP"].map((name, i) =>
    signTexture(
      name,
      i ? "#272263" : "#f2f1db",
      i ? "#fff4da" : "#253544",
      i ? "" : "MARIO KART TELEVISION",
    ),
  );
  const windowMap = canvasTexture(256, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#d4d5c3");
    g.addColorStop(0.6, "#fffde4");
    g.addColorStop(1, "#b6bdad");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#475155";
    for (let x = 0; x < w; x += 64) c.fillRect(x, 0, 4, h);
  });
  const windows = standard("#dfdfd3", {
    map: windowMap,
    emissiveMap: windowMap,
    emissive: "#fff8d9",
    emissiveIntensity: 0.45,
    roughness: 0.35,
  });
  const apronMat = standard("#215a8d"),
    bayFloorMat = standard("#a3aca1"),
    pitSignEnd = signTexture("PIT LANE", "#26313b", "#eee8cb", "MARIO MOTORS"),
    baySigns = Array.from({ length: 14 }, (_, idx) =>
      signTexture(String(idx + 1), "#b7a537", "#fff", ""),
    ),
    roofGlassMat = standard("#718b97", {
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      roughness: 0.3,
    });
  for (const side of [-1, 1])
    for (let i = 0; i < 14; i++) {
      const p = surfaceAt(-35 + i * 8, side * 25),
        g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      g.rotation.y = -p.heading + (side === 1 ? Math.PI : 0);
      world.add(g);
      // Front is local +X. The lower storey is an actual opening, not a dark decal.
      box(g, [12, 0.3, 7.95], [0, 0.15, 0], white);
      box(g, [0.3, 9.6, 7.95], [-5.85, 5, 0], white);
      for (const z of [-3.86, 3.86]) {
        box(g, [8, 4.1, 0.18], [-2, 2.2, z], white);
        // Keep the balcony continuous; full-depth partitions obscure the fans
        // and turn the whole building into blank slabs from the chase camera.
        box(g, [3.6, 5.3, 0.18], [-4.1, 7.2, z], white);
      }
      // A blue working apron joins the opening to the low trackside barrier.
      box(g, [4.5, 0.06, 8], [8.25, 0.06, 0], apronMat);
      box(g, [0.24, 0.7, 7.8], [10.35, 0.39, 0], navy);
      box(g, [0.25, 0.08, 7.8], [10.35, 0.78, 0], white);
      box(g, [0.11, 0.025, 6.9], [7.5, 0.1, 0], yellow);
      if (i === 0 || i === 13) {
        const end = i === 0 ? 1 : -1;
        box(g, [7.7, 3.6, 0.18], [-1.8, 7.2, end * 3.99], windows);
        panel(
          g,
          5.7,
          1.35,
          [-1.8, 4.95, end * 4.1],
          sponsors[0],
          end === 1 ? 0 : Math.PI,
        );
        panel(
          g,
          5.6,
          2.5,
          [-1.8, 2.3, end * 4.1],
          pitSignEnd,
          end === 1 ? 0 : Math.PI,
        );
      }
      box(g, [12, 0.4, 8], [0, 4.3, 0], white);
      box(g, [12, 0.3, 8], [0, 10.2, 0], white);
      box(g, [0.16, 3.55, 7.5], [-2.3, 2.1, 0], inner);
      box(g, [7.8, 0.06, 7.5], [1.5, 0.34, 0], bayFloorMat);
      box(g, [0.2, 0.22, 7.5], [-2.15, 3.72, 0], yellow);
      box(g, [6, 0.07, 0.65], [1.4, 4.06, 0], glow);
      for (const z of [-3.55, 3.55]) {
        box(g, [0.4, 4.15, 0.4], [6, 2.08, z], steel);
        box(g, [0.16, 1.15, 0.48], [6.24, 0.7, z], red);
      }
      // Tire stacks, tool drawers, an overhead hose and a pit crew member.
      if (i % 2 === 0) {
        for (let t = 0; t < 2; t++) {
          const tire = mesh(
            new THREE.TorusGeometry(0.47, 0.16, 5, 10),
            rubber,
            g,
            [2.5, 0.55 + t * 0.4, -2.35],
          );
          tire.rotation.x = Math.PI / 2;
        }
        round(g, [1.25, 1.55, 1.8], [0.8, 1.1, 2.15], paints[i % 5], 0.08);
        attendant(g, 3.25, 0.35, 0.2, i, 1.2);
      }
      box(g, [1.4, 0.11, 1.95], [0.8, 1.93, 2.15], dark);
      box(g, [0.08, 0.08, 5.6], [4.5, 3.85, 0], dark);
      box(g, [0.08, 1.5, 0.08], [4.5, 3.1, -1.6], dark);
      // Spectator balcony, bright rear windows, sponsor fascia and bay numbers.
      box(g, [0.15, 3.7, 7.5], [-2.1, 7.1, 0], windows);
      box(g, [8, 0.24, 8], [2, 5, 0], white);
      box(g, [0.35, 1.4, 8], [6.2, 5.45, 0], navy);
      panel(g, 7.65, 1.35, [6.41, 5.55, 0], sponsors[i % 2], Math.PI / 2);
      panel(
        g,
        1.2,
        0.75,
        [6.42, 4.08, 0],
        baySigns[i],
        Math.PI / 2,
      );
      const fanStep = i % 2 === 0 ? 2 : 4;
      for (let fan = 0; fan < 7; fan += fanStep)
        attendant(g, 5.45, 5.35, -3 + fan * 0.95, i + fan, 1.05);
      for (const z of [-3.5, 0, 3.5])
        box(g, [0.18, 3.9, 0.14], [3.9, 8.1, z], steel);
      box(g, [0.12, 0.12, 7.8], [3.9, 9.92, 0], glow);
      box(g, [14, 0.35, 8.1], [1, 10.4, 0], dark);
      box(g, [0.13, 0.13, 7.8], [7.8, 10.19, 0], glow);
      // A slim cantilever supports the roof without filling the garage opening.
      for (const z of [-3, 3]) {
        const bar = box(g, [3.8, 0.12, 0.12], [6.2, 9.7, z], steel);
        bar.rotation.z = 0.28;
      }
    }
  // Glass/steel cover above the pit straight. Clearance exceeds every racer.
  for (let s = -30; s < 63; s += 15) {
    const p = trackAt(s),
      g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = -p.heading;
    world.add(g);
    box(g, [40, 0.35, 0.45], [0, 14.6, 0], steel);
    for (const x of [-18, 18]) box(g, [0.3, 4.2, 0.3], [x, 12.3, 0], steel);
    for (const x of [-12, 0, 12]) {
      box(g, [0.24, 0.22, 15.1], [x, 14.7, -7.5], steel);
      box(
        g,
        [11.7, 0.1, 14.7],
        [x, 14.86, -7.5],
        roofGlassMat,
      );
      box(g, [3, 0.1, 1.2], [x, 14.37, -7.5], glow);
    }
  }
  const gate = new THREE.Group(),
    p = trackAt(3);
  gate.position.set(p.x, p.y, p.z);
  gate.rotation.y = -p.heading;
  world.add(gate);
  const warm = standard("#e7b735", { metalness: 0.22, roughness: 0.4 });
  for (const x of [-18, 18]) {
    round(gate, [3.4, 13, 3.1], [x, 6.5, 0], warm, 0.22);
    round(gate, [4.1, 1.2, 3.5], [x, 0.6, 0], red, 0.18);
    round(gate, [3.9, 0.7, 3.5], [x, 13, 0], red, 0.18);
    for (let i = 0; i < 5; i++)
      panel(
        gate,
        2.8,
        1.45,
        [x, 3.1 + i * 1.85, 1.57],
        signTexture(
          ["MKTV", "MUSHROOM CUP", "MARIO MOTORS", "GOLDEN WHEEL", "Lemmy’s"][
            i
          ],
          i % 2 ? "#f2eacb" : "#253566",
          i % 2 ? "#253544" : "#fff",
          "",
        ),
      );
  }
  round(gate, [38, 4.6, 2.5], [0, 13.6, 0], warm, 0.35);
  box(gate, [37.5, 0.36, 2.65], [0, 11.64, 0], red);
  box(gate, [37.2, 0.14, 2.7], [0, 15.65, 0], glow);
  const title = canvasTexture(2048, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#fff0a2");
    g.addColorStop(0.35, "#f5ce40");
    g.addColorStop(1, "#d99927");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#fdf1bb";
    c.lineWidth = 10;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "italic 900 169px Arial Black, Arial";
    c.lineJoin = "round";
    c.lineWidth = 12;
    c.strokeStyle = "#647476";
    c.strokeText("MARIOKART", w / 2, h / 2 + 9);
    c.fillStyle = "#fffef0";
    c.fillText("MARIOKART", w / 2, h / 2 + 9);
  });
  panel(gate, 36.7, 4.05, [0, 13.65, 1.27], title);
  panel(gate, 36.7, 4.05, [0, 13.65, -1.27], title, Math.PI);
  const badge = canvasTexture(512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = "#272a6c";
    c.beginPath();
    c.arc(256, 205, 172, 0, 7);
    c.fill();
    c.lineWidth = 14;
    c.strokeStyle = "#f3d34e";
    c.stroke();
    c.fillStyle = "#f4efe0";
    c.beginPath();
    c.ellipse(256, 257, 80, 66, 0, 0, 7);
    c.fill();
    c.fillStyle = "#e73940";
    c.beginPath();
    c.ellipse(256, 170, 119, 91, 0, Math.PI, Math.PI * 2);
    c.lineTo(375, 202);
    c.quadraticCurveTo(256, 235, 137, 202);
    c.closePath();
    c.fill();
    c.fillStyle = "#fff4df";
    for (const x of [176, 256, 336]) {
      c.beginPath();
      c.ellipse(x, x === 256 ? 151 : 181, x === 256 ? 32 : 19, 30, 0, 0, 7);
      c.fill();
    }
    c.fillStyle = "#202a42";
    for (const x of [233, 279]) {
      c.beginPath();
      c.ellipse(x, 259, 8, 20, 0, 0, 7);
      c.fill();
    }
    c.font = "900 67px Arial Black, Arial";
    c.textAlign = "center";
    c.lineWidth = 13;
    c.lineJoin = "round";
    c.strokeStyle = "#282e68";
    c.strokeText("WELCOME!", 256, 425);
    c.fillStyle = "#fff8d7";
    c.fillText("WELCOME!", 256, 425);
  });
  const badgeMat = new THREE.MeshBasicMaterial({
    map: badge,
    transparent: true,
    alphaTest: 0.1,
  });
  mesh(new THREE.PlaneGeometry(7.2, 7.2), badgeMat, gate, [0, 18.35, 1.4]);
  box(gate, [5.3, 0.55, 0.65], [0, 7.85, 0], dark);
  for (const x of [-2.2, 2.2]) box(gate, [0.08, 3.2, 0.08], [x, 9.6, 0], steel);
  return gate;
}
