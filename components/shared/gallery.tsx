'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface GalleryProps {
  images: string[];
  name: string;
}

export function Gallery({ images, name }: GalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const navigate = useCallback(
    (direction: 'prev' | 'next') => {
      setSelectedIndex((prev) =>
        direction === 'next'
          ? (prev + 1) % images.length
          : (prev - 1 + images.length) % images.length
      );
    },
    [images.length]
  );

  return (
    <>
      <div className="space-y-3">
        <div
          className="relative aspect-[16/10] rounded-lg overflow-hidden cursor-pointer group"
          onClick={() => setLightboxOpen(true)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0"
            >
              <Image
                src={images[selectedIndex]}
                alt={`${name} - Image ${selectedIndex + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 60vw"
                priority={selectedIndex === 0}
              />
            </motion.div>
          </AnimatePresence>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          <span className="absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-sm text-xs font-medium">
            {selectedIndex + 1} / {images.length}
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setSelectedIndex(i)}
              className={`relative flex-shrink-0 w-20 h-14 lg:w-24 lg:h-16 rounded-sm overflow-hidden transition-all ${
                i === selectedIndex
                  ? 'ring-2 ring-champagne ring-offset-1 ring-offset-background opacity-100'
                  : 'opacity-60 hover:opacity-90'
              }`}
            >
              <Image
                src={img}
                alt={`${name} thumbnail ${i + 1}`}
                fill
                className="object-cover"
                sizes="96px"
              />
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onClick={() => setLightboxOpen(false)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(false);
              }}
              className="absolute top-6 right-6 text-white/80 hover:text-white p-2 z-10"
              aria-label="Close gallery"
            >
              <X className="w-6 h-6" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate('prev');
              }}
              className="absolute left-4 lg:left-8 text-white/60 hover:text-white p-3 z-10"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate('next');
              }}
              className="absolute right-4 lg:right-8 text-white/60 hover:text-white p-3 z-10"
              aria-label="Next image"
            >
              <ChevronRight className="w-8 h-8" />
            </button>

            <AnimatePresence mode="wait">
              <motion.div
                key={selectedIndex}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25 }}
                className="relative w-full max-w-5xl aspect-[16/10] mx-8"
                onClick={(e) => e.stopPropagation()}
              >
                <Image
                  src={images[selectedIndex]}
                  alt={`${name} - Image ${selectedIndex + 1}`}
                  fill
                  className="object-contain"
                  sizes="90vw"
                />
              </motion.div>
            </AnimatePresence>

            <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm">
              {selectedIndex + 1} / {images.length}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
