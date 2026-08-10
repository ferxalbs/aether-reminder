import React from 'react';
import { DimensionValue } from 'react-native';
import { Calendar, Tag, MapPin, Paperclip } from 'lucide-react-native';
import { AetherContextMenu, type ContextMenuItem } from './AetherContextMenu';

export interface AetherQuickActionsMenuProps {
  onAddDate?: () => void;
  onSetPriority?: () => void;
  onAddLocation?: () => void;
  onAttachFile?: () => void;
  onClose: () => void;
  width?: DimensionValue;
}

export const AetherQuickActionsMenu: React.FC<AetherQuickActionsMenuProps> = ({
  onAddDate,
  onSetPriority,
  onAddLocation,
  onAttachFile,
  onClose,
  width = 200,
}) => {
  const items: ContextMenuItem[] = [
    {
      id: 'add-date',
      label: 'Add date',
      icon: Calendar,
      onPress: () => onAddDate?.(),
    },
    {
      id: 'set-priority',
      label: 'Set priority',
      icon: Tag,
      onPress: () => onSetPriority?.(),
    },
    {
      id: 'add-location',
      label: 'Add location',
      icon: MapPin,
      onPress: () => onAddLocation?.(),
    },
    {
      id: 'attach-file',
      label: 'Attach file',
      icon: Paperclip,
      onPress: () => onAttachFile?.(),
    },
  ];

  return <AetherContextMenu items={items} onClose={onClose} width={width} />;
};
