#include <libproc.h>
#include <sys/proc_info.h>
#include <sys/resource.h>
#include <mach/mach_time.h>
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <errno.h>
#include <string.h>
#include <unistd.h>
#include <dlfcn.h>
#include <libgen.h>
struct coalition_info_ids { uint64_t id[2], reserved[3]; };
typedef pid_t (*responsibility_fn)(pid_t);
int main(void) {
    int bytes = proc_listpids(PROC_ALL_PIDS, 0, NULL, 0);
    if (bytes <= 0) return 1;
    int cap = bytes + 4096;
    pid_t *ids = malloc(cap);
    int count = proc_listpids(PROC_ALL_PIDS, 0, ids, cap) / sizeof(pid_t);
    if (count <= 0 || count*sizeof(pid_t) >= cap) return 2;
    responsibility_fn responsible = (responsibility_fn)dlsym(RTLD_DEFAULT, "responsibility_get_pid_responsible_for_pid");
    mach_timebase_info_data_t timebase;
    mach_timebase_info(&timebase);
    printf("# mach_timebase %u %u; system_process_count %d\n",timebase.numer,timebase.denom,count);
    for (int i = 0; i < count; i++) {
        pid_t pid = ids[i];
        struct proc_bsdinfo info = {0};
        if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info)) != sizeof(info) || info.pbi_uid != getuid()) continue;
        struct coalition_info_ids coal = {0};
        struct rusage_info_v0 r = {0};
        errno=0;
        int nc = proc_pidinfo(pid,20,0,&coal,sizeof(coal));
        int ec = nc == sizeof(coal) ? 0 : (errno ? errno : -1);
        errno=0;
        int rr = proc_pid_rusage(pid,RUSAGE_INFO_V0,(rusage_info_t *)&r);
        int er = rr == 0 ? 0 : (errno ? errno : -1);
        char path[PROC_PIDPATHINFO_MAXSIZE]={0};
        if (!proc_pidpath(pid,path,sizeof(path))) snprintf(path,sizeof(path),"%s",info.pbi_comm);
        printf("%d\t%u\t%d\t%llu\t%llu\t%d\t%d\t%llu\t%llu\t%llu\t%llu\t%llu\t%s\n",pid,info.pbi_ppid,responsible ? responsible(pid) : -1,coal.id[0],coal.id[1],ec,er,r.ri_proc_start_abstime,r.ri_resident_size,r.ri_phys_footprint,r.ri_user_time,r.ri_system_time,basename(path));
    }
    free(ids);
}
