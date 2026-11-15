// Only scrolling down to the end opts back into following live output.
// Being near the end alone must not override an upward wheel/key gesture.
export function nextTranscriptFollowing({following,lastScrollTop,scrollTop,scrollHeight,clientHeight}) {
 // Shrinking content or growing the viewport can clamp the previous position.
 // Only movement above that reachable position is an upward scroll.
 const reachableLastTop=Math.min(lastScrollTop,Math.max(0,scrollHeight-clientHeight));
 if(scrollTop<reachableLastTop)return false;
 if(scrollTop>lastScrollTop&&scrollHeight-scrollTop-clientHeight<8)return true;
 return following;
}
