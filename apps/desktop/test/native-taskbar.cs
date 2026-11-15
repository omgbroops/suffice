using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct PropertyKey {public Guid Format;public uint Id;}
[StructLayout(LayoutKind.Explicit,Size=24)] public struct PropertyValue {[FieldOffset(0)] public ushort Type;[FieldOffset(8)] public IntPtr Pointer;}
[ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface PropertyStore {
 [PreserveSig] int GetCount(out uint count);
 [PreserveSig] int GetAt(uint index,out PropertyKey key);
 [PreserveSig] int GetValue(ref PropertyKey key,out PropertyValue value);
 [PreserveSig] int SetValue(ref PropertyKey key,ref PropertyValue value);
 [PreserveSig] int Commit();
}
public static class SufficeTaskbarProperties {
 [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr handle,ref Guid iid,out PropertyStore store);
 [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropertyValue value);
 public static string Read(long handle,uint id){var iid=new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");PropertyStore store;Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow((IntPtr)handle,ref iid,out store));var key=new PropertyKey{Format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),Id=id};PropertyValue value;Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));try{return value.Type==31?Marshal.PtrToStringUni(value.Pointer):value.Type==8?Marshal.PtrToStringBSTR(value.Pointer):"VT:"+value.Type;}finally{PropVariantClear(ref value);Marshal.ReleaseComObject(store);}}
}
