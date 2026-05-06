
import { supabase } from './supabaseClient';
import { FileSystemItem, User } from './AppContext';

// --- ITEMS (Files/Folders) ---

export const fetchItems = async (): Promise<FileSystemItem[]> => {
  const { data, error } = await supabase
    .from('items')
    .select('*');

  if (error) {
    console.error('Error fetching items:', error);
    return [];
  }

  // Map snake_case DB fields to camelCase TS fields
  return data.map((item: any) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    fileType: item.file_type,
    size: item.size,
    parentId: item.parent_id,
    s3Key: item.s3_key,
    previewUrl: item.preview_url,
    tags: item.tags || [],
    description: item.description,
    rating: item.rating,
    flag: item.flag,
    width: item.width,
    height: item.height,
    make: item.make,
    model: item.model,
    dateTaken: item.date_taken ? new Date(item.date_taken).getTime() : undefined,
    dateAdded: item.date_added ? new Date(item.date_added).getTime() : Date.now(),
    syncStatus: item.sync_status,
    videoMetadata: item.video_metadata,
    proxyS3Key: item.proxy_s3_key,
    groupId: item.group_id,
    isStackTop: item.is_stack_top,
    isAnalyzing: item.is_analyzing
  }));
};

export const upsertItem = async (item: FileSystemItem) => {
  const dbItem = {
    id: item.id,
    user_id: (await supabase.auth.getUser()).data.user?.id,
    name: item.name,
    type: item.type,
    file_type: item.fileType,
    size: item.size,
    parent_id: item.parentId || null,
    s3_key: item.s3Key,
    preview_url: item.previewUrl,
    tags: item.tags,
    description: item.description,
    rating: item.rating,
    flag: item.flag,
    width: item.width,
    height: item.height,
    make: item.make,
    model: item.model,
    date_taken: item.dateTaken ? new Date(item.dateTaken).toISOString() : null,
    sync_status: item.syncStatus,
    video_metadata: item.videoMetadata,
    proxy_s3_key: item.proxyS3Key,
    group_id: item.groupId,
    is_stack_top: item.isStackTop,
    is_analyzing: item.isAnalyzing
  };

  const { error } = await supabase
    .from('items')
    .upsert(dbItem);

  if (error) console.error('Error upserting item:', error);
};

export const deleteItemFromDB = async (id: string) => {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', id);

  if (error) console.error('Error deleting item:', error);
};

// --- USER PROFILE ---

export const fetchUserProfile = async (): Promise<Partial<User> | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) return null;

  return {
    username: data.username || user.email?.split('@')[0],
    email: user.email!,
    plan: data.plan || 'Free',
    avatarUrl: data.avatar_url
  };
};
