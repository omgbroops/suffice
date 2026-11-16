// Measurement-only observer for the private XNU coalition ABI. Never link this
// into the application. See docs/rust-migration/macos-host-measurement.md.
#include <dlfcn.h>
#include <errno.h>
#include <libproc.h>
#include <mach/mach_time.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

enum { PID_COALITION_INFO = 20 };
struct coalition_ids { uint64_t resource, jetsam, reserved[3]; };
// xnu-12377.121.6, osfmk/mach/coalition.h: return only the verified prefix.
// Fields between cpu_time and physical_footprint cover I/O, energy and QoS.
struct resource_usage {
    uint64_t started, exited, nonempty, cpu_time, unused[36], physical_footprint;
};
_Static_assert(offsetof(struct resource_usage, physical_footprint) == 320, "coalition ABI");
typedef int (*coalition_usage_fn)(uint64_t, struct resource_usage *, size_t);
typedef pid_t (*responsible_fn)(pid_t);

struct process {
    pid_t pid, parent, responsible;
    struct coalition_ids coal;
    bool included;
};

static bool read_ids(pid_t pid, struct coalition_ids *coal) {
    return proc_pidinfo(pid, PID_COALITION_INFO, 0, coal, sizeof(*coal)) == sizeof(*coal);
}
static int ledger(coalition_usage_fn usage, uint64_t id, struct resource_usage *value) {
    if (usage(id, value, sizeof(*value)) == 0) return 0;
    return errno ? errno : EIO;
}
static void print_ledger(const struct resource_usage *r, int error, uint64_t timestamp) {
    printf("{\"error\":%d,\"ticks\":\"%llu\",\"tasksStarted\":%llu,\"tasksExited\":%llu,"
           "\"cpuTicks\":\"%llu\",\"physicalBytes\":%llu}", error, timestamp,
           r->started, r->exited, r->cpu_time, r->physical_footprint);
}
static void print_name(pid_t pid) {
    char path[PROC_PIDPATHINFO_MAXSIZE] = {0};
    if (proc_pidpath(pid, path, sizeof(path)) <= 0) proc_name(pid, path, sizeof(path));
    char *slash = strrchr(path, '/');
    const unsigned char *name = (const unsigned char *)(slash ? slash + 1 : path);
    putchar('"');
    for (; *name; name++) {
        if (*name < 32 || *name > 126 || *name == '"' || *name == '\\') printf("\\u%04x", *name);
        else putchar(*name);
    }
    putchar('"');
}
static bool decimal(const char *s, uint64_t *value) {
    if (!*s || strspn(s, "0123456789") != strlen(s)) return false;
    errno=0;
    *value=strtoull(s,NULL,10);
    return !errno && *value;
}
// Check only explicitly observed PIDs. Never inspect the coalition of a reused
// PID or send a signal. Missing or inaccessible identity data stays explicit.
static int identities(int argc, char **argv) {
    if (argc < 3 || argc > 130) return 2;
    pid_t pids[128];
    for (int i=2;i<argc;i++) {
        uint64_t number;
        if (!decimal(argv[i],&number) || number>INT32_MAX) return 2;
        pids[i-2]=(pid_t)number;
    }
    putchar('[');
    for (int i=0;i<argc-2;i++) {
        struct proc_bsdinfo first={0},last={0};
        struct rusage_info_v0 info={0};
        int error=0;
        errno=0;
        if (proc_pidinfo(pids[i],PROC_PIDTBSDINFO,0,&first,sizeof(first))!=sizeof(first)) error=errno?errno:EIO;
        else if (first.pbi_uid!=getuid()) error=EPERM;
        else if (proc_pid_rusage(pids[i],RUSAGE_INFO_V0,(rusage_info_t *)&info)) error=errno?errno:EIO;
        else if (proc_pidinfo(pids[i],PROC_PIDTBSDINFO,0,&last,sizeof(last))!=sizeof(last)) error=errno?errno:EIO;
        else if (last.pbi_uid!=first.pbi_uid || last.pbi_start_tvsec!=first.pbi_start_tvsec ||
                 last.pbi_start_tvusec!=first.pbi_start_tvusec || !info.ri_proc_start_abstime) error=EAGAIN;
        if (i) putchar(',');
        printf("{\"pid\":%d,\"start\":\"%llu\",\"error\":%d,\"uid\":",pids[i],error?0ULL:info.ri_proc_start_abstime,error);
        if (error) fputs("null}",stdout); else printf("%u}",first.pbi_uid);
    }
    puts("]");
    return 0;
}
int main(int argc, char **argv) {
    if (argc>=2 && strcmp(argv[1],"identities")==0) return identities(argc,argv);
    bool cleanup = argc == 4 && strcmp(argv[1], "members") == 0;
    uint64_t root_num = 0;
    struct coalition_ids target = {0};
    if (cleanup) {
        if (!decimal(argv[2],&target.resource) || !decimal(argv[3],&target.jetsam)) return 2;
    } else if (argc != 3 || strcmp(argv[1], "snapshot") || !decimal(argv[2],&root_num) || root_num > INT32_MAX) {
        fputs("usage: macos-accounting snapshot PID | members RESOURCE_ID JETSAM_ID | identities PID...\n", stderr);
        return 2;
    }
    pid_t root=(pid_t)root_num;
    struct rusage_info_v0 root_info={0};
    if (!cleanup && (!read_ids(root,&target) || !target.resource || !target.jetsam ||
        proc_pid_rusage(root,RUSAGE_INFO_V0,(rusage_info_t *)&root_info))) {
        fputs("root process identity/coalition unavailable\n",stderr);
        return 3;
    }
    coalition_usage_fn usage=(coalition_usage_fn)dlsym(RTLD_DEFAULT,"coalition_info_resource_usage");
    responsible_fn responsible=(responsible_fn)dlsym(RTLD_DEFAULT,"responsibility_get_pid_responsible_for_pid");
    if (!usage || !responsible) { fputs("required coalition/responsibility API unavailable\n",stderr); return 4; }
    struct resource_usage before={0},after={0};
    uint64_t start=mach_absolute_time();
    int pre_error=ledger(usage,target.resource,&before);
    int length=proc_listpids(PROC_ALL_PIDS,0,NULL,0);
    if (length <= 0 || length > 32*1024*1024) return 5;
    int capacity=length+16384;
    pid_t *pids=malloc((size_t)capacity);
    struct process *rows=calloc((size_t)capacity/sizeof(pid_t),sizeof(*rows));
    if (!pids || !rows) return 5;
    int bytes=proc_listpids(PROC_ALL_PIDS,0,pids,capacity);
    if (bytes<=0 || bytes>=capacity) { fputs("incomplete process inventory\n",stderr); return 5; }
    size_t count=0;
    for (size_t i=0;i<(size_t)bytes/sizeof(pid_t);i++) {
        struct proc_bsdinfo bsd={0};
        if (proc_pidinfo(pids[i],PROC_PIDTBSDINFO,0,&bsd,sizeof(bsd)) != sizeof(bsd) || bsd.pbi_uid != getuid()) continue;
        struct process *r=&rows[count++];
        r->pid=pids[i];r->parent=(pid_t)bsd.pbi_ppid;r->responsible=responsible(r->pid);
        read_ids(r->pid,&r->coal);
        r->included=r->coal.resource==target.resource || r->coal.jetsam==target.jetsam ||
                    (!cleanup && (r->pid==root || r->responsible==root));
    }
    // Discover descendants that escaped the expected coalition, and report
    // them as mismatches instead of silently undercounting.
    if (!cleanup) {
        bool grew;
        do {
            grew=false;
            for (size_t i=0;i<count;i++) if (!rows[i].included) {
                for (size_t j=0;j<count;j++) if (rows[j].included && rows[j].pid==rows[i].parent) {
                    rows[i].included=true;grew=true;break;
                }
            }
        } while (grew);
    }
    mach_timebase_info_data_t t;
    mach_timebase_info(&t);
    printf("{\"resource\":\"%llu\",\"jetsam\":\"%llu\",\"rootStart\":\"%llu\","
           "\"numer\":%u,\"denom\":%u,\"before\":",target.resource,target.jetsam,root_info.ri_proc_start_abstime,t.numer,t.denom);
    print_ledger(&before,pre_error,start);
    fputs(",\"members\":[",stdout);
    bool first=true;
    for(size_t i=0;i<count;i++) {
        struct process *r=&rows[i];
        if (!r->included) continue;
        struct rusage_info_v0 info={0};struct coalition_ids recheck={0};
        int error=proc_pid_rusage(r->pid,RUSAGE_INFO_V0,(rusage_info_t *)&info) ? (errno?errno:EIO) : 0;
        if (!read_ids(r->pid,&recheck) || memcmp(&r->coal,&recheck,2*sizeof(uint64_t))) error=EAGAIN;
        if (!first) putchar(',');
        first=false;
        printf("{\"pid\":%d,\"ppid\":%d,\"responsible\":%d,\"resource\":\"%llu\",\"jetsam\":\"%llu\","
               "\"start\":\"%llu\",\"rssBytes\":%llu,\"physicalBytes\":%llu,\"userTicks\":\"%llu\","
               "\"systemTicks\":\"%llu\",\"error\":%d,\"name\":",r->pid,r->parent,r->responsible,
               r->coal.resource,r->coal.jetsam,info.ri_proc_start_abstime,info.ri_resident_size,
               info.ri_phys_footprint,info.ri_user_time,info.ri_system_time,error);
        print_name(r->pid);putchar('}');
    }
    int post_error=ledger(usage,target.resource,&after);
    fputs("],\"after\":",stdout);print_ledger(&after,post_error,mach_absolute_time());puts("}");
    free(rows);free(pids);
    return 0;
}
