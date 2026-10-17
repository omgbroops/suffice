cd ~/suffice; S=~/overnight-2026-10-16/tracks/harness/research/specs
specs187="$S/picomatch-187.contract.spec.mjs $S/picomatch-187.symptom.spec.mjs reports/picomatch-haiku-specs/picomatch-187.haiku.spec.mjs $(ls reports/picomatch-clause-specs/*.mjs)"
specs142="$S/picomatch-142.contract.spec.mjs $S/picomatch-142.symptom.spec.mjs reports/picomatch-haiku-specs/picomatch-142.haiku.spec.mjs"
mat(){ id=$1; specs="$2"; shift 2; for w in "$@"; do case $w in /*) W=$w;; *) W=$PWD/$w;; esac; printf "%-18s " $(basename $w); for sp in $specs; do SUFFICE_WORKSPACE=$W node --test $sp >/dev/null 2>&1 && printf 1 || printf 0; done; SUFFICE_WORKSPACE=$W node --test benchmarks/real/$id.test.mjs >/dev/null 2>&1 && echo " ACC=1" || echo " ACC=0"; done; }
echo "187 cols: contract symptom haiku c1 c2 c3 i1 i2 i3"; mat picomatch-187 "$specs187" .suffice/real-tasks/picomatch-187/reference .suffice/attempts/picomatch-187-{a1,a2,a3,s1,s2} /tmp/aud-{e1,e2,e3,h1,h2,h3}
echo "142 cols: contract symptom haiku"; mat picomatch-142 "$specs142" .suffice/real-tasks/picomatch-142/reference .suffice/attempts/picomatch-142-* /tmp/p142-{1,2,3}
