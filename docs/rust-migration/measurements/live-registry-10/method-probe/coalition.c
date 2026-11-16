#include "xnu-12377-mach-coalition.h"
#include <mach/mach_time.h>
#include <stdio.h>
#include <stdlib.h>
#include <dlfcn.h>
#include <errno.h>
typedef int (*usage_fn)(uint64_t,struct coalition_resource_usage *,size_t);
int main(int argc, char **argv) {
    if (argc!=2) return 1;
    uint64_t id=strtoull(argv[1],NULL,10);
    usage_fn usage=(usage_fn)dlsym(RTLD_DEFAULT,"coalition_info_resource_usage");
    if (!usage) return 2;
    struct coalition_resource_usage r={0}; mach_timebase_info_data_t t; mach_timebase_info(&t);
    uint64_t before=mach_absolute_time();
    if (usage(id,&r,sizeof(r))!=0){perror("coalition");return 3;}
    uint64_t after=mach_absolute_time();
    printf("{\"cid\":%llu,\"started\":%llu,\"exited\":%llu,\"cpuTicks\":%llu,\"physicalBytes\":%llu,\"numer\":%u,\"denom\":%u,\"before\":%llu,\"after\":%llu}\n",id,r.tasks_started,r.tasks_exited,r.cpu_time,r.phys_footprint,t.numer,t.denom,before,after);
}
