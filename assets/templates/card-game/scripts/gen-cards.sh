#!/usr/bin/env bash
# 西游斗法卡面批量生成（apiz / nano-banana-2，竖版 3:4）
set -u
OUT="D:/boardgame.io-main/journey-west/src/assets/cards"
mkdir -p "$OUT"
STYLE="Chinese mythology trading card illustration, traditional gong-bi ink and heavy-color painting, ornate dark gold filigree border background, rich detail, vertical portrait composition, no text, no letters"

declare -A CARDS=(
  [wukong]="Sun Wukong the Monkey King in golden battle armor with golden headband, wielding the golden staff Ruyi Jingu Bang, fiery golden eyes, heroic dynamic pose"
  [erlang]="Erlang Shen the three-eyed warrior god, shining third eye on forehead, silver celestial armor, long spear, divine hound dog beside him, imposing heaven general"
  [bullking]="Bull Demon King, massive horned demon king with dark red skin, heavy black iron armor, burning flames aura, terrifying power"
  [sixears]="Six-Eared Macaque, sinister monkey warrior resembling Monkey King but with six ears, purple ominous aura, dark staff, mirror phantom illusion"
  [redboy]="Red Boy the child demon, red bellyband child with fire wheels under bare feet, breathing samadhi true fire, mischievous fierce expression"
  [ironfan]="Princess Iron Fan, elegant demon queen in emerald and gold robes holding a large banana leaf fan, graceful and powerful"
  [bajie]="Zhu Bajie the pig warrior, big belly pig-faced monk with nine-toothed rake, travel robes, hearty brave expression"
  [wujing]="Sha Wujing the blue-skinned monk warrior, skull bead necklace, precious monk staff, calm loyal guardian expression"
  [imp]="small mountain patrol demon imp, little horned goblin soldier carrying a flag and paper lantern, comical cowardly look"
  [transform]="72 Transformations magic spell, swirling mystical cloud with transforming monkey silhouettes, azure and gold magic whirl"
  [jingu]="Tightening Fillet Spell, glowing golden headband floating in air radiating rings of golden light, mystic sanskrit script energy"
  [ginseng]="Ginseng Fruit spell, glowing divine ginseng baby-shaped fruit hanging on golden immortal tree, soft holy light"
  [elixir]="Soul-Returning Elixir spell, radiant golden pill rising from a bronze alchemy furnace with green smoke, Taishang Laojun cauldron"
)

gen_one() {
  local key="$1" desc="$2"
  local tmp="$OUT/.${key}.json"
  for attempt in 1 2 3; do
    if apiz generate "$desc, $STYLE" --model fal-ai/nano-banana-2 --aspect-ratio "3:4" --wait --wait-timeout 3m --json > "$tmp" 2>"$OUT/.${key}.err"; then
      local url
      url=$(node -e "const r=require(process.argv[1]); const u=r&&r.result&&r.result.images&&r.result.images[0]&&r.result.images[0].url; process.stdout.write(u||'')" "$tmp")
      if [ -n "$url" ]; then
        curl -sL "$url" -o "$OUT/${key}.jpg" && \
          node -e "const fs=require('fs');const s=fs.statSync(process.argv[1]).size;if(s<5000)process.exit(1)" "$OUT/${key}.jpg" && {
          rm -f "$tmp" "$OUT/.${key}.err"
          echo "OK $key ($(stat -c%s "$OUT/${key}.jpg" 2>/dev/null || wc -c < "$OUT/${key}.jpg") bytes)"
          return 0
        }
      fi
    fi
    echo "retry $key (attempt $attempt)"
    sleep 3
  done
  echo "FAIL $key"
  return 1
}

# 并行批次（每批 4-5 个，避免队列拥塞）
FAILED=0
for batch in "wukong erlang bullking sixEars" "redboy ironfan bajie wujing" "imp transform jingu ginseng elixir"; do
  for key in $batch; do
    gen_one "$key" "${CARDS[$key]}" &
  done
  wait
done

# 校验产物
echo "=== done ==="
ls -la "$OUT"/*.jpg 2>/dev/null | wc -l
