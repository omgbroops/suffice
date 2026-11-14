// Only scrolling down to the end opts back into following live output.
// Being near the end alone must not override an upward wheel/key gesture.
export function nextTranscriptFollowing({following,lastScrollTop,scrollTop,scrollHeight,clientHeight}) {
 if(scrollTop<lastScrollTop)return false;
 if(scrollTop>lastScrollTop&&scrollHeight-scrollTop-clientHeight<8)return true;
 return following;
}
